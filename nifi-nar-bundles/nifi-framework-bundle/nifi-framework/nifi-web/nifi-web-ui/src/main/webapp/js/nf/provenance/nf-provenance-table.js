/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* global nf, top, define, module, require, exports */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery',
                'Slick',
                'nf.Common',
                'nf.Dialog',
                'nf.ErrorHandler',
                'nf.Storage',
                'nf.ng.Bridge'],
            function ($, Slick, common, dialog, errorHandler, storage, angularBridge) {
                return (nf.ng.ProvenanceTable = factory($, Slick, common, dialog, errorHandler, storage, angularBridge));
            });
    } else if (typeof exports === 'object' && typeof module === 'object') {
        module.exports = (nf.ng.ProvenanceTable =
            factory(require('jquery'),
                require('Slick'),
                require('nf.Common'),
                require('nf.Dialog'),
                require('nf.ErrorHandler'),
                require('nf.Storage'),
                require('nf.ng.Bridge')));
    } else {
        nf.ng.ProvenanceTable = factory(root.$,
            root.Slick,
            root.nf.Common,
            root.nf.Dialog,
            root.nf.ErrorHandler,
            root.nf.Storage,
            root.nf.ng.Bridge);
    }
}(this, function ($, Slick, common, dialog, errorHandler, storage, angularBridge) {
    'use strict';

    var nfProvenanceTable = function (provenanceLineageCtrl) {
        'use strict';

        /**
         * Configuration object used to hold a number of configuration items.
         */
        var config = {
            maxResults: 1000,
            defaultStartTime: '00:00:00',
            defaultEndTime: '23:59:59',
            styles: {
                hidden: 'hidden'
            },
            urls: {
                searchOptions: '../nifi-api/provenance/search-options',
                replays: '../nifi-api/provenance-events/replays',
                provenance: '../nifi-api/provenance',
                provenanceEvents: '../nifi-api/provenance-events/',
                clusterSearch: '../nifi-api/flow/cluster/search-results',
                d3Script: 'js/d3/d3.min.js',
                lineageScript: 'js/nf/provenance/nf-provenance-lineage.js',
                uiExtensionToken: '../nifi-api/access/ui-extension-token',
                downloadToken: '../nifi-api/access/download-token'
            }
        };

        /**
         * The last search performed
         */
        var cachedQuery = {};

        /**
         * Downloads the content for the provenance event that is currently loaded in the specified direction.
         *
         * @param {string} direction
         */
        var downloadContent = function (direction) {
            var eventId = $('#provenance-event-id').text();

            // build the url
            var dataUri = config.urls.provenanceEvents + encodeURIComponent(eventId) + '/content/' + encodeURIComponent(direction);

            // perform the request once we've received a token
            common.getAccessToken(config.urls.downloadToken).done(function (downloadToken) {
                var parameters = {};

                // conditionally include the ui extension token
                if (!common.isBlank(downloadToken)) {
                    parameters['access_token'] = downloadToken;
                }

                // conditionally include the cluster node id
                var clusterNodeId = $('#provenance-event-cluster-node-id').text();
                if (!common.isBlank(clusterNodeId)) {
                    parameters['clusterNodeId'] = clusterNodeId;
                }

                // open the url
                if ($.isEmptyObject(parameters)) {
                    window.open(dataUri);
                } else {
                    window.open(dataUri + '?' + $.param(parameters));
                }
            }).fail(function () {
                dialog.showOkDialog({
                    headerText: 'Provenance',
                    dialogContent: 'Unable to generate access token for downloading content.'
                });
            });
        };

        /**
         * Views the content for the provenance event that is currently loaded in the specified direction.
         *
         * @param {string} direction
         */
        var viewContent = function (direction) {
            var controllerUri = $('#nifi-controller-uri').text();
            var eventId = $('#provenance-event-id').text();

            // build the uri to the data
            var dataUri = controllerUri + 'provenance-events/' + encodeURIComponent(eventId) + '/content/' + encodeURIComponent(direction);

            // generate tokens as necessary
            var getAccessTokens = $.Deferred(function (deferred) {
                if (storage.hasItem('jwt')) {
                    // generate a token for the ui extension and another for the callback
                    var uiExtensionToken = $.ajax({
                        type: 'POST',
                        url: config.urls.uiExtensionToken
                    });
                    var downloadToken = $.ajax({
                        type: 'POST',
                        url: config.urls.downloadToken
                    });

                    // wait for each token
                    $.when(uiExtensionToken, downloadToken).done(function (uiExtensionTokenResult, downloadTokenResult) {
                        var uiExtensionToken = uiExtensionTokenResult[0];
                        var downloadToken = downloadTokenResult[0];
                        deferred.resolve(uiExtensionToken, downloadToken);
                    }).fail(function () {
                        dialog.showOkDialog({
                            headerText: 'Provenance',
                            dialogContent: 'Unable to generate access token for viewing content.'
                        });
                        deferred.reject();
                    });
                } else {
                    deferred.resolve('', '');
                }
            }).promise();

            // perform the request after we've received the tokens
            getAccessTokens.done(function (uiExtensionToken, downloadToken) {
                var dataUriParameters = {};

                // conditionally include the cluster node id
                var clusterNodeId = $('#provenance-event-cluster-node-id').text();
                if (!common.isBlank(clusterNodeId)) {
                    dataUriParameters['clusterNodeId'] = clusterNodeId;
                }

                // include the download token if applicable
                if (!common.isBlank(downloadToken)) {
                    dataUriParameters['access_token'] = downloadToken;
                }

                // include parameters if necessary
                if ($.isEmptyObject(dataUriParameters) === false) {
                    dataUri = dataUri + '?' + $.param(dataUriParameters);
                }

                // open the content viewer
                var contentViewerUrl = $('#nifi-content-viewer-url').text();

                // if there's already a query string don't add another ?... this assumes valid
                // input meaning that if the url has already included a ? it also contains at
                // least one query parameter
                if (contentViewerUrl.indexOf('?') === -1) {
                    contentViewerUrl += '?';
                } else {
                    contentViewerUrl += '&';
                }

                var contentViewerParameters = {
                    'ref': dataUri
                };

                // include the download token if applicable
                if (!common.isBlank(uiExtensionToken)) {
                    contentViewerParameters['access_token'] = uiExtensionToken;
                }

                // open the content viewer
                window.open(contentViewerUrl + $.param(contentViewerParameters));
            });
        };

        /**
         * Initializes the details dialog.
         */
        var initDetailsDialog = function () {
            // initialize the properties tabs
            $('#event-details-tabs').tabbs({
                tabStyle: 'tab',
                selectedTabStyle: 'selected-tab',
                scrollableTabContentStyle: 'scrollable',
                tabs: [{
                    name: 'Details',
                    tabContentId: 'event-details-tab-content'
                }, {
                    name: 'Attributes',
                    tabContentId: 'attributes-tab-content'
                }, {
                    name: 'Content',
                    tabContentId: 'content-tab-content'
                }]
            });

            $('#event-details-dialog').modal({
                scrollableContentStyle: 'scrollable',
                headerText: 'Provenance Event',
                buttons: [{
                    buttonText: 'Ok',
                    color: {
                        base: '#728E9B',
                        hover: '#004849',
                        text: '#ffffff'
                    },
                    handler: {
                        click: function () {
                            $('#event-details-dialog').modal('hide');
                        }
                    }
                }],
                handler: {
                    close: function () {
                        // clear the details
                        $('#additional-provenance-details').empty();
                        $('#attributes-container').empty();
                        $('#parent-flowfiles-container').empty();
                        $('#child-flowfiles-container').empty();
                        $('#provenance-event-cluster-node-id').text('');
                        $('#modified-attribute-toggle').removeClass('checkbox-checked').addClass('checkbox-unchecked');
                    },
                    open: function () {
                        common.toggleScrollable($('#' + this.find('.tab-container').attr('id') + '-content').get(0));
                    }
                }
            });

            // toggle which attributes are visible
            $('#modified-attribute-toggle').on('click', function () {
                var unmodifiedAttributes = $('#attributes-container div.attribute-unmodified');
                if (unmodifiedAttributes.is(':visible')) {
                    $('#attributes-container div.attribute-unmodified').hide();
                } else {
                    $('#attributes-container div.attribute-unmodified').show();
                }
            });

            // input download
            $('#input-content-download').on('click', function () {
                downloadContent('input');
            });

            // output download
            $('#output-content-download').on('click', function () {
                downloadContent('output');
            });

            // if a content viewer url is specified, use it
            if (common.isContentViewConfigured()) {
                // input view
                $('#input-content-view').on('click', function () {
                    viewContent('input');
                });

                // output view
                $('#output-content-view').on('click', function () {
                    viewContent('output');
                });
            }

            // handle the replay and downloading
            $('#replay-content').on('click', function () {
                var replayEntity = {
                    'eventId': $('#provenance-event-id').text()
                };

                // conditionally include the cluster node id
                var clusterNodeId = $('#provenance-event-cluster-node-id').text();
                if (!common.isBlank(clusterNodeId)) {
                    replayEntity['clusterNodeId'] = clusterNodeId;
                }

                $.ajax({
                    type: 'POST',
                    url: config.urls.replays,
                    data: JSON.stringify(replayEntity),
                    dataType: 'json',
                    contentType: 'application/json'
                }).done(function (response) {
                    dialog.showOkDialog({
                        headerText: 'Provenance',
                        dialogContent: 'Successfully submitted replay request.'
                    });
                }).fail(errorHandler.handleAjaxError);

                $('#event-details-dialog').modal('hide');
            });

            // show the replay panel
            $('#replay-details').show();
        };

        /**
         * Initializes the search dialog.
         *
         * @param {boolean} isClustered     Whether or not this NiFi clustered
         */
        var initSearchDialog = function (isClustered, provenanceTableCtrl) {
            // configure the start and end date picker
            $('#provenance-search-start-date, #provenance-search-end-date').datepicker({
                showAnim: '',
                showOtherMonths: true,
                selectOtherMonths: true
            });

            // initialize the default start date/time
            $('#provenance-search-start-date').datepicker('setDate', '+0d');
            $('#provenance-search-end-date').datepicker('setDate', '+0d');
            $('#provenance-search-start-time').val('00:00:00');
            $('#provenance-search-end-time').val('23:59:59');

            // initialize the default file sizes
            $('#provenance-search-minimum-file-size').val('');
            $('#provenance-search-maximum-file-size').val('');

            // allow users to be able to search a specific node
            if (isClustered) {
                // make the dialog larger to support the select location
                $('#provenance-search-dialog').height(575);

                // get the nodes in the cluster
                $.ajax({
                    type: 'GET',
                    url: config.urls.clusterSearch,
                    dataType: 'json'
                }).done(function (response) {
                    var nodeResults = response.nodeResults;

                    // create the searchable options
                    var searchableOptions = [{
                        text: 'cluster',
                        value: null
                    }];

                    // sort the nodes
                    nodeResults.sort(function (a, b) {
                        var compA = a.address.toUpperCase();
                        var compB = b.address.toUpperCase();
                        return (compA < compB) ? -1 : (compA > compB) ? 1 : 0;
                    });

                    // add each node
                    $.each(nodeResults, function (_, nodeResult) {
                        searchableOptions.push({
                            text: nodeResult.address,
                            value: nodeResult.id
                        });
                    });

                    // populate the combo
                    $('#provenance-search-location').combo({
                        options: searchableOptions
                    });
                }).fail(errorHandler.handleAjaxError);

                // show the node search combo
                $('#provenance-search-location-container').show();
            }

            // configure the search dialog
            $('#provenance-search-dialog').modal({
                scrollableContentStyle: 'scrollable',
                headerText: 'Search Events',
                buttons: [{
                    buttonText: 'Search',
                    color: {
                        base: '#728E9B',
                        hover: '#004849',
                        text: '#ffffff'
                    },
                    handler: {
                        click: function () {
                            $('#provenance-search-dialog').modal('hide');

                            var search = {};

                            // extract the start date time
                            var startDate = $.trim($('#provenance-search-start-date').val());
                            var startTime = $.trim($('#provenance-search-start-time').val());
                            if (startDate !== '') {
                                if (startTime === '') {
                                    startTime = config.defaultStartTime;
                                    $('#provenance-search-start-time').val(startTime);
                                }
                                search['startDate'] = startDate + ' ' + startTime + ' ' + $('.timezone:first').text();
                            }

                            // extract the end date time
                            var endDate = $.trim($('#provenance-search-end-date').val());
                            var endTime = $.trim($('#provenance-search-end-time').val());
                            if (endDate !== '') {
                                if (endTime === '') {
                                    endTime = config.defaultEndTime;
                                    $('#provenance-search-end-time').val(endTime);
                                }
                                search['endDate'] = endDate + ' ' + endTime + ' ' + $('.timezone:first').text();
                            }

                            // extract the min/max file size
                            var minFileSize = $.trim($('#provenance-search-minimum-file-size').val());
                            if (minFileSize !== '') {
                                search['minimumFileSize'] = minFileSize;
                            }

                            var maxFileSize = $.trim($('#provenance-search-maximum-file-size').val());
                            if (maxFileSize !== '') {
                                search['maximumFileSize'] = maxFileSize;
                            }

                            // limit search to a specific node
                            if (isClustered) {
                                var searchLocation = $('#provenance-search-location').combo('getSelectedOption');
                                if (searchLocation.value !== null) {
                                    search['clusterNodeId'] = searchLocation.value;
                                }
                            }

                            // add the search criteria
                            search['searchTerms'] = getSearchCriteria();

                            // reload the table
                            provenanceTableCtrl.loadProvenanceTable(search);
                        }
                    }
                },
                    {
                        buttonText: 'Cancel',
                        color: {
                            base: '#E3E8EB',
                            hover: '#C7D2D7',
                            text: '#004849'
                        },
                        handler: {
                            click: function () {
                                $('#provenance-search-dialog').modal('hide');
                            }
                        }
                    }]
            });

            return $.ajax({
                type: 'GET',
                url: config.urls.searchOptions,
                dataType: 'json'
            }).done(function (response) {
                var provenanceOptions = response.provenanceOptions;

                // load all searchable fields
                $.each(provenanceOptions.searchableFields, function (_, field) {
                    appendSearchableField(field);
                });
            });
        };

        /**
         * Initializes the provenance query dialog.
         */
        var initProvenanceQueryDialog = function () {
            // initialize the dialog
            $('#provenance-query-dialog').modal({
                scrollableContentStyle: 'scrollable',
                headerText: 'Searching provenance events...'
            });
        };

        /**
         * Appends the specified searchable field to the search dialog.
         *
         * @param {type} field      The searchable field
         */
        var appendSearchableField = function (field) {
            var searchableField = $('<div class="searchable-field"></div>').appendTo('#searchable-fields-container');
            $('<span class="searchable-field-id hidden"></span>').text(field.id).appendTo(searchableField);
            $('<div class="searchable-field-name"></div>').text(field.label).appendTo(searchableField);
            $('<div class="searchable-field-value"><input type="text" class="searchable-field-input"/></div>').appendTo(searchableField);
            $('<div class="clear"></div>').appendTo(searchableField);

            // make the searchable accessible for populating
            if (field.id === 'ProcessorID') {
                searchableField.find('input').addClass('searchable-component-id');
            } else if (field.id === 'FlowFileUUID') {
                searchableField.find('input').addClass('searchable-flowfile-uuid');
            }

            // ensure the no searchable fields message is hidden
            $('#no-searchable-fields').hide();
        };

        /**
         * Gets the search criteria that the user has specified.
         */
        var getSearchCriteria = function () {
            var searchCriteria = {};
            $('#searchable-fields-container').children('div.searchable-field').each(function () {
                var searchableField = $(this);
                var fieldId = searchableField.children('span.searchable-field-id').text();
                var searchValue = $.trim(searchableField.find('input.searchable-field-input').val());

                // if the field isn't blank include it in the search
                if (!common.isBlank(searchValue)) {
                    searchCriteria[fieldId] = searchValue;
                }
            });
            return searchCriteria;
        };

        /**
         * Initializes the provenance table.
         *
         * @param {boolean} isClustered     Whether or not this instance is clustered
         */
        var initProvenanceTable = function (isClustered, provenanceTableCtrl) {
            // define the function for filtering the list
            $('#provenance-filter').keyup(function () {
                applyFilter();
            });

            // filter options
            var filterOptions = [{
                text: 'by component name',
                value: 'componentName'
            }, {
                text: 'by component type',
                value: 'componentType'
            }, {
                text: 'by type',
                value: 'eventType'
            }];

            // if clustered, allowing filtering by node id
            if (isClustered) {
                filterOptions.push({
                    text: 'by node',
                    value: 'clusterNodeAddress'
                });
            }

            // initialize the filter combo
            $('#provenance-filter-type').combo({
                options: filterOptions,
                select: function (option) {
                    applyFilter();
                }
            });

            // clear the current search
            $('#clear-provenance-search').click(function () {
                // clear each searchable field
                $('#searchable-fields-container').find('input.searchable-field-input').each(function () {
                    $(this).val('');
                });

                // reset the default start date/time
                $('#provenance-search-start-date').datepicker('setDate', '+0d');
                $('#provenance-search-end-date').datepicker('setDate', '+0d');
                $('#provenance-search-start-time').val('00:00:00');
                $('#provenance-search-end-time').val('23:59:59');

                // reset the minimum and maximum file size
                $('#provenance-search-minimum-file-size').val('');
                $('#provenance-search-maximum-file-size').val('');

                // if we are clustered reset the selected option
                if (isClustered) {
                    $('#provenance-search-location').combo('setSelectedOption', {
                        text: 'cluster'
                    });
                }

                // reset the stored query
                cachedQuery = {};

                // reload the table
                provenanceTableCtrl.loadProvenanceTable();
            });

            // add hover effect and click handler for opening the dialog
            $('#provenance-search-button').click(function () {
                $('#provenance-search-dialog').modal('show');

                // adjust the field width for a potential scrollbar
                var searchFieldContainer = $('#searchable-fields-container');
                if (searchFieldContainer.get(0).scrollHeight > Math.round(searchFieldContainer.innerHeight())) {
                    $('input.searchable-field-input').width(245);
                } else {
                    $('input.searchable-field-input').width(260);
                }
            });

            // define a custom formatter for the more details column
            var moreDetailsFormatter = function (row, cell, value, columnDef, dataContext) {
                return '<div title="View Details" class="pointer show-event-details fa fa-info-circle"></div>';
            };

            // define how general values are formatted
            var valueFormatter = function (row, cell, value, columnDef, dataContext) {
                return common.formatValue(value);
            };

            // determine if the this page is in the shell
            var isInShell = (top !== window);

            // define how the column is formatted
            var showLineageFormatter = function (row, cell, value, columnDef, dataContext) {
                var markup = '';

                // conditionally include the cluster node id
                if (common.SUPPORTS_SVG) {
                    markup += '<div title="Show Lineage" class="pointer show-lineage icon icon-lineage" style="margin-right: 3px;"></div>';
                }

                // conditionally support going to the component
                var isRemotePort = dataContext.componentType === 'Remote Input Port' || dataContext.componentType === 'Remote Output Port';
                if (isInShell && common.isDefinedAndNotNull(dataContext.groupId) && isRemotePort === false) {
                    markup += '<div class="pointer go-to fa fa-long-arrow-right" title="Go To"></div>';
                }

                return markup;
            };

            // initialize the provenance table
            var provenanceColumns = [
                {
                    id: 'moreDetails',
                    name: '&nbsp;',
                    sortable: false,
                    resizable: false,
                    formatter: moreDetailsFormatter,
                    width: 50,
                    maxWidth: 50
                },
                {
                    id: 'eventTime',
                    name: 'Date/Time',
                    field: 'eventTime',
                    sortable: true,
                    defaultSortAsc: false,
                    resizable: true
                },
                {
                    id: 'eventType',
                    name: 'Type',
                    field: 'eventType',
                    sortable: true,
                    resizable: true
                },
                {
                    id: 'flowFileUuid',
                    name: 'FlowFile Uuid',
                    field: 'flowFileUuid',
                    sortable: true,
                    resizable: true
                },
                {
                    id: 'fileSize',
                    name: 'Size',
                    field: 'fileSize',
                    sortable: true,
                    defaultSortAsc: false,
                    resizable: true
                },
                {
                    id: 'componentName',
                    name: 'Component Name',
                    field: 'componentName',
                    sortable: true,
                    resizable: true,
                    formatter: valueFormatter
                },
                {
                    id: 'componentType',
                    name: 'Component Type',
                    field: 'componentType',
                    sortable: true,
                    resizable: true
                }
            ];

            // conditionally show the cluster node identifier
            if (isClustered) {
                provenanceColumns.push({
                    id: 'clusterNodeAddress',
                    name: 'Node',
                    field: 'clusterNodeAddress',
                    sortable: true,
                    resizable: true
                });
            }

            // conditionally show the action column
            if (common.SUPPORTS_SVG || isInShell) {
                provenanceColumns.push({
                    id: 'actions',
                    name: '&nbsp;',
                    formatter: showLineageFormatter,
                    resizable: false,
                    sortable: false,
                    width: 50,
                    maxWidth: 50
                });
            }

            var provenanceOptions = {
                forceFitColumns: true,
                enableTextSelectionOnCells: true,
                enableCellNavigation: true,
                enableColumnReorder: false,
                autoEdit: false,
                multiSelect: false,
                rowHeight: 24
            };

            // create the remote model
            var provenanceData = new Slick.Data.DataView({
                inlineFilters: false
            });
            provenanceData.setItems([]);
            provenanceData.setFilterArgs({
                searchString: '',
                property: 'name'
            });
            provenanceData.setFilter(filter);

            // initialize the sort
            sort({
                columnId: 'eventTime',
                sortAsc: false
            }, provenanceData);

            // initialize the grid
            var provenanceGrid = new Slick.Grid('#provenance-table', provenanceData, provenanceColumns, provenanceOptions);
            provenanceGrid.setSelectionModel(new Slick.RowSelectionModel());
            provenanceGrid.registerPlugin(new Slick.AutoTooltips());

            // initialize the grid sorting
            provenanceGrid.setSortColumn('eventTime', false);
            provenanceGrid.onSort.subscribe(function (e, args) {
                sort({
                    columnId: args.sortCol.field,
                    sortAsc: args.sortAsc
                }, provenanceData);
            });

            // configure a click listener
            provenanceGrid.onClick.subscribe(function (e, args) {
                var target = $(e.target);

                // get the node at this row
                var item = provenanceData.getItem(args.row);

                // determine the desired action
                if (provenanceGrid.getColumns()[args.cell].id === 'actions') {
                    if (target.hasClass('show-lineage')) {
                        provenanceLineageCtrl.showLineage(item.flowFileUuid, item.eventId.toString(), item.clusterNodeId, provenanceTableCtrl);
                    } else if (target.hasClass('go-to')) {
                        goTo(item);
                    }
                } else if (provenanceGrid.getColumns()[args.cell].id === 'moreDetails') {
                    if (target.hasClass('show-event-details')) {
                        provenanceTableCtrl.showEventDetails(item.eventId, item.clusterNodeId);
                    }
                }
            });

            // wire up the dataview to the grid
            provenanceData.onRowCountChanged.subscribe(function (e, args) {
                provenanceGrid.updateRowCount();
                provenanceGrid.render();

                // update the total number of displayed events if necessary
                $('#displayed-events').text(common.formatInteger(args.current));
            });
            provenanceData.onRowsChanged.subscribe(function (e, args) {
                provenanceGrid.invalidateRows(args.rows);
                provenanceGrid.render();
            });

            // hold onto an instance of the grid
            $('#provenance-table').data('gridInstance', provenanceGrid);

            // initialize the number of displayed items
            $('#displayed-events').text('0');
            $('#total-events').text('0');
        };

        /**
         * Applies the filter found in the filter expression text field.
         */
        var applyFilter = function () {
            // get the dataview
            var provenanceGrid = $('#provenance-table').data('gridInstance');

            // ensure the grid has been initialized
            if (common.isDefinedAndNotNull(provenanceGrid)) {
                var provenanceData = provenanceGrid.getData();

                // update the search criteria
                provenanceData.setFilterArgs({
                    searchString: getFilterText(),
                    property: $('#provenance-filter-type').combo('getSelectedOption').value
                });
                provenanceData.refresh();
            }
        };

        /**
         * Get the text out of the filter field. If the filter field doesn't
         * have any text it will contain the text 'filter list' so this method
         * accounts for that.
         */
        var getFilterText = function () {
            return $('#provenance-filter').val();
        };

        /**
         * Performs the provenance filtering.
         *
         * @param {object} item     The item subject to filtering
         * @param {object} args     Filter arguments
         * @returns {Boolean}       Whether or not to include the item
         */
        var filter = function (item, args) {
            if (args.searchString === '') {
                return true;
            }

            try {
                // perform the row filtering
                var filterExp = new RegExp(args.searchString, 'i');
            } catch (e) {
                // invalid regex
                return false;
            }

            return item[args.property].search(filterExp) >= 0;
        };

        /**
         * Sorts the data according to the sort details.
         *
         * @param {type} sortDetails
         * @param {type} data
         */
        var sort = function (sortDetails, data) {
            // defines a function for sorting
            var comparer = function (a, b) {
                if (sortDetails.columnId === 'eventTime') {
                    var aTime = common.parseDateTime(a[sortDetails.columnId]).getTime();
                    var bTime = common.parseDateTime(b[sortDetails.columnId]).getTime();
                    if (aTime === bTime) {
                        return a['id'] - b['id'];
                    } else {
                        return aTime - bTime;
                    }
                } else if (sortDetails.columnId === 'fileSize') {
                    var aSize = common.parseSize(a[sortDetails.columnId]);
                    var bSize = common.parseSize(b[sortDetails.columnId]);
                    if (aSize === bSize) {
                        return a['id'] - b['id'];
                    } else {
                        return aSize - bSize;
                    }
                } else {
                    var aString = common.isDefinedAndNotNull(a[sortDetails.columnId]) ? a[sortDetails.columnId] : '';
                    var bString = common.isDefinedAndNotNull(b[sortDetails.columnId]) ? b[sortDetails.columnId] : '';
                    if (aString === bString) {
                        return a['id'] - b['id'];
                    } else {
                        return aString === bString ? 0 : aString > bString ? 1 : -1;
                    }
                }
            };

            // perform the sort
            data.sort(comparer, sortDetails.sortAsc);
        };

        /**
         * Submits a new provenance query.
         *
         * @argument {object} provenance The provenance query
         * @returns {deferred}
         */
        var submitProvenance = function (provenance) {
            var provenanceEntity = {
                'provenance': {
                    'request': $.extend({
                        maxResults: config.maxResults,
                        summarize: true,
                        incrementalResults: false
                    }, provenance)
                }
            };

            // submit the provenance request
            return $.ajax({
                type: 'POST',
                url: config.urls.provenance,
                data: JSON.stringify(provenanceEntity),
                dataType: 'json',
                contentType: 'application/json'
            }).fail(errorHandler.handleAjaxError);
        };

        /**
         * Gets the results from the provenance query for the specified id.
         *
         * @param {object} provenance
         * @returns {deferred}
         */
        var getProvenance = function (provenance) {
            var url = provenance.uri;
            if (common.isDefinedAndNotNull(provenance.request.clusterNodeId)) {
                url += '?' + $.param({
                        clusterNodeId: provenance.request.clusterNodeId,
                        summarize: true,
                        incrementalResults: false
                    });
            } else {
                url += '?' + $.param({
                        summarize: true,
                        incrementalResults: false
                    });
            }

            return $.ajax({
                type: 'GET',
                url: url,
                dataType: 'json'
            }).fail(errorHandler.handleAjaxError);
        };

        /**
         * Cancels the specified provenance query.
         *
         * @param {object} provenance
         * @return {deferred}
         */
        var cancelProvenance = function (provenance) {
            var url = provenance.uri;
            if (common.isDefinedAndNotNull(provenance.request.clusterNodeId)) {
                url += '?' + $.param({
                        clusterNodeId: provenance.request.clusterNodeId
                    });
            }

            return $.ajax({
                type: 'DELETE',
                url: url,
                dataType: 'json'
            }).fail(errorHandler.handleAjaxError);
        };

        /**
         * Checks the results of the specified provenance.
         *
         * @param {object} provenance
         */
        var loadProvenanceResults = function (provenance, provenanceTableCtrl) {
            var provenanceRequest = provenance.request;
            var provenanceResults = provenance.results;

            // ensure there are groups specified
            if (common.isDefinedAndNotNull(provenanceResults.provenanceEvents)) {
                var provenanceTable = $('#provenance-table').data('gridInstance');
                var provenanceData = provenanceTable.getData();

                // set the items
                provenanceData.setItems(provenanceResults.provenanceEvents);
                provenanceData.reSort();
                provenanceTable.invalidate();

                // update the stats last refreshed timestamp
                $('#provenance-last-refreshed').text(provenanceResults.generated);

                // update the oldest event available
                $('#oldest-event').html(common.formatValue(provenanceResults.oldestEvent));

                // record the server offset
                provenanceTableCtrl.serverTimeOffset = provenanceResults.timeOffset;

                // determines if the specified query is blank (no search terms, start or end date)
                var isBlankQuery = function (query) {
                    return common.isUndefinedOrNull(query.startDate) && common.isUndefinedOrNull(query.endDate) && $.isEmptyObject(query.searchTerms);
                };

                // update the filter message based on the request
                if (isBlankQuery(provenanceRequest)) {
                    var message = 'Showing the most recent ';
                    if (provenanceResults.totalCount >= config.maxResults) {
                        message += (common.formatInteger(config.maxResults) + ' of ' + provenanceResults.total + ' events, please refine the search.');
                    } else {
                        message += ('events.');
                    }
                    $('#provenance-query-message').text(message);
                    $('#clear-provenance-search').hide();
                } else {
                    var message = 'Showing ';
                    if (provenanceResults.totalCount >= config.maxResults) {
                        message += (common.formatInteger(config.maxResults) + ' of ' + provenanceResults.total + ' events that match the specified query, please refine the search.');
                    } else {
                        message += ('the events that match the specified query.');
                    }
                    $('#provenance-query-message').text(message);
                    $('#clear-provenance-search').show();
                }

                // update the total number of events
                $('#total-events').text(common.formatInteger(provenanceResults.provenanceEvents.length));
            } else {
                $('#total-events').text('0');
            }
        };

        /**
         * Goes to the specified component if possible.
         *
         * @argument {object} item       The event it
         */
        var goTo = function (item) {
            // ensure the component is still present in the flow
            if (common.isDefinedAndNotNull(item.groupId)) {
                // only attempt this if we're within a frame
                if (top !== window) {
                    // and our parent has canvas utils and shell defined
                    if (common.isDefinedAndNotNull(parent.nf) && common.isDefinedAndNotNull(parent.nf.CanvasUtils) && common.isDefinedAndNotNull(parent.nf.Shell)) {
                        parent.nf.CanvasUtils.showComponent(item.groupId, item.componentId);
                        parent.$('#shell-close-button').click();
                    }
                }
            }
        };

        function ProvenanceTableCtrl() {

            /**

             * The server time offset
             */
            this.serverTimeOffset = null;
        }

        ProvenanceTableCtrl.prototype = {
            constructor: ProvenanceTableCtrl,

            /**
             * Initializes the provenance table. Returns a deferred that will indicate when/if the table has initialized successfully.
             *
             * @param {boolean} isClustered     Whether or not this instance is clustered
             */
            init: function (isClustered) {
                var provenanceTableCtrl = this;
                return $.Deferred(function (deferred) {
                    // handles init failure
                    var failure = function (xhr, status, error) {
                        deferred.reject();
                        errorHandler.handleAjaxError(xhr, status, error);
                    };

                    // initialize the lineage view
                    provenanceLineageCtrl.init();

                    // initialize the table view
                    initDetailsDialog();
                    initProvenanceQueryDialog();
                    initProvenanceTable(isClustered, provenanceTableCtrl);
                    initSearchDialog(isClustered, provenanceTableCtrl).done(function () {
                        deferred.resolve();
                    }).fail(failure);
                }).promise();
            },

            /**
             * Update the size of the grid based on its container's current size.
             */
            resetTableSize: function () {
                var provenanceGrid = $('#provenance-table').data('gridInstance');
                if (common.isDefinedAndNotNull(provenanceGrid)) {
                    provenanceGrid.resizeCanvas();
                }
            },

            /**
             * Updates the value of the specified progress bar.
             *
             * @param {jQuery}  progressBar
             * @param {integer} value
             * @returns {undefined}
             */
            updateProgress: function (progressBar, value) {
                // remove existing labels
                progressBar.find('div.progress-label').remove();
                progressBar.find('md-progress-linear').remove();

                // update the progress bar
                var label = $('<div class="progress-label"></div>').text(value + '%');
                (angularBridge.injector.get('$compile')($('<md-progress-linear ng-cloak ng-value="' + value + '" class="md-hue-2" md-mode="determinate" aria-label="Progress"></md-progress-linear>'))(angularBridge.rootScope)).appendTo(progressBar);
                progressBar.append(label);
            },

            /**
             * Loads the provenance table with events according to the specified optional
             * query. If not query is specified or it is empty, the most recent entries will
             * be returned.
             *
             * @param {object} query
             */
            loadProvenanceTable: function (query) {
                var provenanceTableCtrl = this;
                var provenanceProgress = $('#provenance-percent-complete');

                // add support to cancel outstanding requests - when the button is pressed we
                // could be in one of two stages, 1) waiting to GET the status or 2)
                // in the process of GETting the status. Handle both cases by cancelling
                // the setTimeout (1) and by setting a flag to indicate that a request has
                // been request so we can ignore the results (2).

                var cancelled = false;
                var provenance = null;
                var provenanceTimer = null;

                // update the progress bar value
                provenanceTableCtrl.updateProgress(provenanceProgress, 0);

                // show the 'searching...' dialog
                $('#provenance-query-dialog').modal('setButtonModel', [{
                    buttonText: 'Cancel',
                    color: {
                        base: '#E3E8EB',
                        hover: '#C7D2D7',
                        text: '#004849'
                    },
                    handler: {
                        click: function () {
                            cancelled = true;

                            // we are waiting for the next poll attempt
                            if (provenanceTimer !== null) {
                                // cancel it
                                clearTimeout(provenanceTimer);

                                // cancel the provenance
                                closeDialog();
                            }
                        }
                    }
                }]).modal('show');

                // -----------------------------
                // determine the provenance query
                // -----------------------------

                // handle the specified query appropriately
                if (common.isDefinedAndNotNull(query)) {
                    // store the last query performed
                    cachedQuery = query;
                } else if (!$.isEmptyObject(cachedQuery)) {
                    // use the last query performed
                    query = cachedQuery;
                } else {
                    // don't use a query
                    query = {};
                }

                // closes the searching dialog and cancels the query on the server
                var closeDialog = function () {
                    // cancel the provenance results since we've successfully processed the results
                    if (common.isDefinedAndNotNull(provenance)) {
                        cancelProvenance(provenance);
                    }

                    // close the dialog
                    $('#provenance-query-dialog').modal('hide');
                };

                // polls the server for the status of the provenance
                var pollProvenance = function () {
                    getProvenance(provenance).done(function (response) {
                        // update the provenance
                        provenance = response.provenance;

                        // process the provenance
                        processProvenanceResponse();
                    }).fail(closeDialog);
                };

                // processes the provenance
                var processProvenanceResponse = function () {
                    // if the request was cancelled just ignore the current response
                    if (cancelled === true) {
                        closeDialog();
                        return;
                    }

                    // update the percent complete
                    provenanceTableCtrl.updateProgress(provenanceProgress, provenance.percentCompleted);

                    // process the results if they are finished
                    if (provenance.finished === true) {
                        // show any errors when the query finishes
                        if (!common.isEmpty(provenance.results.errors)) {
                            var errors = provenance.results.errors;
                            dialog.showOkDialog({
                                headerText: 'Provenance',
                                dialogContent: common.formatUnorderedList(errors),
                            });
                        }

                        // process the results
                        loadProvenanceResults(provenance, provenanceTableCtrl);

                        // hide the dialog
                        closeDialog();
                    } else {
                        // start the wait to poll again
                        provenanceTimer = setTimeout(function () {
                            // clear the timer since we've been invoked
                            provenanceTimer = null;

                            // poll provenance
                            pollProvenance();
                        }, 2000);
                    }
                };

                // once the query is submitted wait until its finished
                submitProvenance(query).done(function (response) {
                    // update the provenance
                    provenance = response.provenance;

                    // process the results, if they are not done wait 1 second before trying again
                    processProvenanceResponse();
                }).fail(closeDialog);
            },

            /**
             * Gets the details for the specified event.
             *
             * @param {string} eventId
             * @param {string} clusterNodeId    The id of the node in the cluster where this event/flowfile originated
             */
            getEventDetails: function (eventId, clusterNodeId) {
                var url;
                if (nf.Common.isDefinedAndNotNull(clusterNodeId)) {
                    url = config.urls.provenanceEvents + encodeURIComponent(eventId) + '?' + $.param({
                            clusterNodeId: clusterNodeId
                        });
                } else {
                    url = config.urls.provenanceEvents + encodeURIComponent(eventId);
                }

                return $.ajax({
                    type: 'GET',
                    url: url,
                    dataType: 'json'
                }).fail(nf.Common.handleAjaxError);
            },

            /**
             * Shows the details for the specified action.
             *
             * @param {string} eventId
             * @param {string} clusterNodeId    The id of the node in the cluster where this event/flowfile originated
             */
            showEventDetails: function (eventId, clusterNodeId) {
                provenanceTableCtrl.getEventDetails(eventId, clusterNodeId).done(function (response) {
                    var event = response.provenanceEvent;

                    // update the event details
                    $('#provenance-event-id').text(event.eventId);
                    $('#provenance-event-time').html(common.formatValue(event.eventTime)).ellipsis();
                    $('#provenance-event-type').html(common.formatValue(event.eventType)).ellipsis();
                    $('#provenance-event-flowfile-uuid').html(common.formatValue(event.flowFileUuid)).ellipsis();
                    $('#provenance-event-component-id').html(common.formatValue(event.componentId)).ellipsis();
                    $('#provenance-event-component-name').html(common.formatValue(event.componentName)).ellipsis();
                    $('#provenance-event-component-type').html(common.formatValue(event.componentType)).ellipsis();
                    $('#provenance-event-details').html(common.formatValue(event.details)).ellipsis();

                    // over the default tooltip with the actual byte count
                    var fileSize = $('#provenance-event-file-size').html(common.formatValue(event.fileSize)).ellipsis();
                    fileSize.attr('title', common.formatInteger(event.fileSizeBytes) + ' bytes');

                    // sets an duration
                    var setDuration = function (field, value) {
                        if (common.isDefinedAndNotNull(value)) {
                            if (value === 0) {
                                field.text('< 1ms');
                            } else {
                                field.text(common.formatDuration(value));
                            }
                        } else {
                            field.html('<span class="unset">No value set</span>');
                        }
                    };

                    // handle durations
                    setDuration($('#provenance-event-duration'), event.eventDuration);
                    setDuration($('#provenance-lineage-duration'), event.lineageDuration);

                    // formats an event detail
                    var formatEventDetail = function (label, value) {
                        $('<div class="event-detail"></div>').append(
                            $('<div class="detail-name"></div>').text(label)).append(
                            $('<div class="detail-value">' + common.formatValue(value) + '</div>').ellipsis()).append(
                            $('<div class="clear"></div>')).appendTo('#additional-provenance-details');
                    };

                    // conditionally show RECEIVE details
                    if (event.eventType === 'RECEIVE') {
                        formatEventDetail('Source FlowFile Id', event.sourceSystemFlowFileId);
                        formatEventDetail('Transit Uri', event.transitUri);
                    }

                    // conditionally show SEND details
                    if (event.eventType === 'SEND') {
                        formatEventDetail('Transit Uri', event.transitUri);
                    }

                    // conditionally show ADDINFO details
                    if (event.eventType === 'ADDINFO') {
                        formatEventDetail('Alternate Identifier Uri', event.alternateIdentifierUri);
                    }

                    // conditionally show ROUTE details
                    if (event.eventType === 'ROUTE') {
                        formatEventDetail('Relationship', event.relationship);
                    }

                    // conditionally show FETCH details
                    if (event.eventType === 'FETCH') {
                        formatEventDetail('Transit Uri', event.transitUri);
                    }

                    // conditionally show the cluster node identifier
                    if (common.isDefinedAndNotNull(event.clusterNodeId)) {
                        // save the cluster node id
                        $('#provenance-event-cluster-node-id').text(event.clusterNodeId);

                        // render the cluster node address
                        formatEventDetail('Node Address', event.clusterNodeAddress);
                    }

                    // populate the parent/child flowfile uuids
                    var parentUuids = $('#parent-flowfiles-container');
                    var childUuids = $('#child-flowfiles-container');

                    // handle parent flowfiles
                    if (common.isEmpty(event.parentUuids)) {
                        $('#parent-flowfile-count').text(0);
                        parentUuids.append('<span class="unset">No parents</span>');
                    } else {
                        $('#parent-flowfile-count').text(event.parentUuids.length);
                        $.each(event.parentUuids, function (_, uuid) {
                            $('<div></div>').text(uuid).appendTo(parentUuids);
                        });
                    }

                    // handle child flowfiles
                    if (common.isEmpty(event.childUuids)) {
                        $('#child-flowfile-count').text(0);
                        childUuids.append('<span class="unset">No children</span>');
                    } else {
                        $('#child-flowfile-count').text(event.childUuids.length);
                        $.each(event.childUuids, function (_, uuid) {
                            $('<div></div>').text(uuid).appendTo(childUuids);
                        });
                    }

                    // get the attributes container
                    var attributesContainer = $('#attributes-container');

                    // get any action details
                    $.each(event.attributes, function (_, attribute) {
                        // create the attribute record
                        var attributeRecord = $('<div class="attribute-detail"></div>')
                            .append($('<div class="attribute-name">' + common.formatValue(attribute.name) + '</div>').ellipsis())
                            .appendTo(attributesContainer);

                        // add the current value
                        attributeRecord
                            .append($('<div class="attribute-value">' + common.formatValue(attribute.value) + '</div>').ellipsis())
                            .append('<div class="clear"></div>');

                        // show the previous value if the property has changed
                        if (attribute.value !== attribute.previousValue) {
                            if (common.isDefinedAndNotNull(attribute.previousValue)) {
                                attributeRecord
                                    .append($('<div class="modified-attribute-value">' + common.formatValue(attribute.previousValue) + '<span class="unset"> (previous)</span></div>').ellipsis())
                                    .append('<div class="clear"></div>');
                            } else {
                                attributeRecord
                                    .append($('<div class="unset" style="font-size: 13px; padding-top: 2px;">' + common.formatValue(attribute.previousValue) + '</div>').ellipsis())
                                    .append('<div class="clear"></div>');
                            }
                        } else {
                            // mark this attribute as not modified
                            attributeRecord.addClass('attribute-unmodified');
                        }
                    });

                    var formatContentValue = function (element, value) {
                        if (common.isDefinedAndNotNull(value)) {
                            element.removeClass('unset').text(value);
                        } else {
                            element.addClass('unset').text('No value previously set');
                        }
                    };

                    // content
                    $('#input-content-header').text('Input Claim');
                    formatContentValue($('#input-content-container'), event.inputContentClaimContainer);
                    formatContentValue($('#input-content-section'), event.inputContentClaimSection);
                    formatContentValue($('#input-content-identifier'), event.inputContentClaimIdentifier);
                    formatContentValue($('#input-content-offset'), event.inputContentClaimOffset);
                    formatContentValue($('#input-content-bytes'), event.inputContentClaimFileSizeBytes);

                    // input content file size
                    var inputContentSize = $('#input-content-size');
                    formatContentValue(inputContentSize, event.inputContentClaimFileSize);
                    if (common.isDefinedAndNotNull(event.inputContentClaimFileSize)) {
                        // over the default tooltip with the actual byte count
                        inputContentSize.attr('title', common.formatInteger(event.inputContentClaimFileSizeBytes) + ' bytes');
                    }

                    formatContentValue($('#output-content-container'), event.outputContentClaimContainer);
                    formatContentValue($('#output-content-section'), event.outputContentClaimSection);
                    formatContentValue($('#output-content-identifier'), event.outputContentClaimIdentifier);
                    formatContentValue($('#output-content-offset'), event.outputContentClaimOffset);
                    formatContentValue($('#output-content-bytes'), event.outputContentClaimFileSizeBytes);

                    // output content file size
                    var outputContentSize = $('#output-content-size');
                    formatContentValue(outputContentSize, event.outputContentClaimFileSize);
                    if (common.isDefinedAndNotNull(event.outputContentClaimFileSize)) {
                        // over the default tooltip with the actual byte count
                        outputContentSize.attr('title', common.formatInteger(event.outputContentClaimFileSizeBytes) + ' bytes');
                    }

                    if (event.inputContentAvailable === true) {
                        $('#input-content-download').show();

                        if (common.isContentViewConfigured()) {
                            $('#input-content-view').show();
                        } else {
                            $('#input-content-view').hide();
                        }
                    } else {
                        $('#input-content-download').hide();
                        $('#input-content-view').hide();
                    }

                    if (event.outputContentAvailable === true) {
                        $('#output-content-download').show();

                        if (common.isContentViewConfigured()) {
                            $('#output-content-view').show();
                        } else {
                            $('#output-content-view').hide();
                        }
                    } else {
                        $('#output-content-download').hide();
                        $('#output-content-view').hide();
                    }

                    if (event.replayAvailable === true) {
                        $('#replay-content, #replay-content-connection').show();
                        formatContentValue($('#replay-connection-id'), event.sourceConnectionIdentifier);
                        $('#replay-content-message').hide();
                    } else {
                        $('#replay-content, #replay-content-connection').hide();
                        $('#replay-content-message').text(event.replayExplanation).show();
                    }

                    // show the dialog
                    $('#event-details-dialog').modal('show');
                });
            }
        }

        var provenanceTableCtrl = new ProvenanceTableCtrl();
        return provenanceTableCtrl;
    };

    return nfProvenanceTable;
}));