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

/* global nf, Slick, d3 */

nf.Settings = (function () {

    var config = {
        node: 'node',
        ncm: 'ncm',
        filterText: 'Filter',
        styles: {
            filterList: 'filter-list'
        },
        urls: {
            controllerConfig: '../nifi-api/controller/config',
            controllerArchive: '../nifi-api/controller/archive',
            controllerServiceTypes: '../nifi-api/controller/controller-service-types',
            controllerServices: '../nifi-api/controller/controller-services',
            reportingTaskTypes: '../nifi-api/controller/reporting-task-types',
            reportingTasks: '../nifi-api/controller/reporting-tasks'
        }
    };

    var gridOptions = {
        forceFitColumns: true,
        enableTextSelectionOnCells: true,
        enableCellNavigation: true,
        enableColumnReorder: false,
        autoEdit: false,
        multiSelect: false
    };

    /**
     * Initializes the general tab.
     */
    var initGeneral = function () {
        // update the visibility of the controls
        if (nf.Common.isDFM()) {
            $('#general-settings div.editable').show();
            $('#general-settings div.read-only').hide();

            // register the click listener for the archive link
            $('#archive-flow-link').click(function () {
                var revision = nf.Client.getRevision();

                $.ajax({
                    type: 'POST',
                    url: config.urls.controllerArchive,
                    data: {
                        version: revision.version,
                        clientId: revision.clientId
                    },
                    dataType: 'json'
                }).done(function (response) {
                    // update the revision
                    nf.Client.setRevision(response.revision);

                    // show the result dialog
                    nf.Dialog.showOkDialog({
                        dialogContent: 'A new flow archive was successfully created.',
                        overlayBackground: false
                    });
                }).fail(nf.Common.handleAjaxError);
            });

            // register the click listener for the save button
            $('#settings-save').click(function () {
                var revision = nf.Client.getRevision();

                // marshal the configuration details
                var configuration = marshalConfiguration();
                configuration['version'] = revision.version;
                configuration['clientId'] = revision.clientId;

                // save the new configuration details
                $.ajax({
                    type: 'PUT',
                    url: config.urls.controllerConfig,
                    data: configuration,
                    dataType: 'json'
                }).done(function (response) {
                    // update the revision
                    nf.Client.setRevision(response.revision);

                    // update the displayed name
                    document.title = response.config.name;

                    // set the data flow title and close the shell
                    $('#data-flow-title-container').children('span.link:first-child').text(response.config.name);

                    // close the settings dialog
                    nf.Dialog.showOkDialog({
                        dialogContent: 'Settings successfully applied.',
                        overlayBackground: false
                    });
                }).fail(nf.Common.handleAjaxError);
            });
        } else {
            $('#general-settings div.editable').hide();
            $('#general-settings div.read-only').show();
        }
    };

    /**
     * Marshals the details to include in the configuration request.
     */
    var marshalConfiguration = function () {
        // create the configuration
        var configuration = {};
        configuration['name'] = $('#data-flow-title-field').val();
        configuration['comments'] = $('#data-flow-comments-field').val();
        configuration['maxTimerDrivenThreadCount'] = $('#maximum-timer-driven-thread-count-field').val();
        configuration['maxEventDrivenThreadCount'] = $('#maximum-event-driven-thread-count-field').val();
        return configuration;
    };

    /**
     * Get the text out of the filter field. If the filter field doesn't
     * have any text it will contain the text 'filter list' so this method
     * accounts for that.
     */
    var getControllerServiceTypeFilterText = function () {
        var filterText = '';
        var filterField = $('#controller-service-type-filter');
        if (!filterField.hasClass(config.styles.filterList)) {
            filterText = filterField.val();
        }
        return filterText;
    };

    /**
     * Filters the processor type table.
     */
    var applyControllerServiceTypeFilter = function () {
        // get the dataview
        var controllerServiceTypesGrid = $('#controller-service-types-table').data('gridInstance');

        // ensure the grid has been initialized
        if (nf.Common.isDefinedAndNotNull(controllerServiceTypesGrid)) {
            var controllerServiceTypesData = controllerServiceTypesGrid.getData();

            // update the search criteria
            controllerServiceTypesData.setFilterArgs({
                searchString: getControllerServiceTypeFilterText()
            });
            controllerServiceTypesData.refresh();

            // update the selection if possible
            if (controllerServiceTypesData.getLength() > 0) {
                controllerServiceTypesGrid.setSelectedRows([0]);
            }
        }
    };

    /**
     * Hides the selected controller service.
     */
    var clearSelectedControllerService = function () {
        $('#controller-service-type-description').text('');
        $('#controller-service-type-name').text('');
        $('#selected-controller-service-name').text('');
        $('#selected-controller-service-type').text('');
        $('#controller-service-description-container').hide();
    };

    /**
     * Clears the selected controller service type.
     */
    var clearControllerServiceSelection = function () {
        // clear the selected row
        clearSelectedControllerService();

        // clear the active cell the it can be reselected when its included
        var controllerServiceTypesGrid = $('#controller-service-types-table').data('gridInstance');
        controllerServiceTypesGrid.resetActiveCell();
    };

    /**
     * Performs the filtering.
     *
     * @param {object} item     The item subject to filtering
     * @param {object} args     Filter arguments
     * @returns {Boolean}       Whether or not to include the item
     */
    var filterControllerServiceTypes = function (item, args) {
        // determine if the item matches the filter
        var matchesFilter = matchesRegex(item, args);

        // determine if the row matches the selected tags
        var matchesTags = true;
        if (matchesFilter) {
            var tagFilters = $('#controller-service-tag-cloud').tagcloud('getSelectedTags');
            var hasSelectedTags = tagFilters.length > 0;
            if (hasSelectedTags) {
                matchesTags = matchesSelectedTags(tagFilters, item['tags']);
            }
        }

        // determine if this row should be visible
        var matches = matchesFilter && matchesTags;

        // if this row is currently selected and its being filtered
        if (matches === false && $('#selected-controller-service-type').text() === item['type']) {
            clearControllerServiceSelection();
        }

        return matches;
    };

    /**
     * Determines if the item matches the filter.
     *
     * @param {object} item     The item to filter
     * @param {object} args     The filter criteria
     * @returns {boolean}       Whether the item matches the filter
     */
    var matchesRegex = function (item, args) {
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

        // determine if the item matches the filter
        var matchesLabel = item['label'].search(filterExp) >= 0;
        var matchesTags = item['tags'].search(filterExp) >= 0;
        return matchesLabel || matchesTags;
    };

    /**
     * Determines if the specified tags match all the tags selected by the user.
     *
     * @argument {string[]} tagFilters      The tag filters
     * @argument {string} tags              The tags to test
     */
    var matchesSelectedTags = function (tagFilters, tags) {
        var selectedTags = [];
        $.each(tagFilters, function (_, filter) {
            selectedTags.push(filter);
        });

        // normalize the tags
        var normalizedTags = tags.toLowerCase();

        var matches = true;
        $.each(selectedTags, function (i, selectedTag) {
            if (normalizedTags.indexOf(selectedTag) === -1) {
                matches = false;
                return false;
            }
        });

        return matches;
    };

    /**
     * Adds the currently selected controller service.
     */
    var addSelectedControllerService = function () {
        var selectedServiceType = $('#selected-controller-service-type').text();

        // ensure something was selected
        if (selectedServiceType === '') {
            nf.Dialog.showOkDialog({
                dialogContent: 'The type of controller service to create must be selected.',
                overlayBackground: false
            });
        } else {
            addControllerService(selectedServiceType);
        }
    };

    /**
     * Adds a new controller service of the specified type.
     *
     * @param {string} controllerServiceType
     */
    var addControllerService = function (controllerServiceType) {
        var revision = nf.Client.getRevision();

        // get the desired availability
        var availability;
        if (nf.Canvas.isClustered()) {
            availability = $('#controller-service-availability-combo').combo('getSelectedOption').value;
        } else {
            availability = config.node;
        }

        // add the new controller service
        var addService = $.ajax({
            type: 'POST',
            url: config.urls.controllerServices + '/' + encodeURIComponent(availability),
            data: {
                version: revision.version,
                clientId: revision.clientId,
                type: controllerServiceType
            },
            dataType: 'json'
        }).done(function (response) {
            // update the revision
            nf.Client.setRevision(response.revision);

            // add the item
            var controllerService = response.controllerService;
            var controllerServicesGrid = $('#controller-services-table').data('gridInstance');
            var controllerServicesData = controllerServicesGrid.getData();
            controllerServicesData.addItem(controllerService);

            // resort
            controllerServicesData.reSort();
            controllerServicesGrid.invalidate();

            // select the new controller service
            var row = controllerServicesData.getRowById(controllerService.id);
            controllerServicesGrid.setSelectedRows([row]);
            controllerServicesGrid.scrollRowIntoView(row);
        }).fail(nf.Common.handleAjaxError);

        // hide the dialog
        $('#new-controller-service-dialog').modal('hide');

        return addService;
    };

    /**
     * Initializes the new controller service dialog.
     */
    var initNewControllerServiceDialog = function () {
        // specify the controller service availability
        if (nf.Canvas.isClustered()) {
            $('#controller-service-availability-combo').combo({
                options: [{
                    text: 'Node',
                    value: config.node,
                    description: 'This controller service will be available on the nodes only.'
                }, {
                    text: 'Cluster Manager',
                    value: config.ncm,
                    description: 'This controller service will be available on the cluster manager only.'
                }]
            });
            $('#controller-service-availability-container').show();
        }

        // define the function for filtering the list
        $('#controller-service-type-filter').on('keyup', function (e) {
            var code = e.keyCode ? e.keyCode : e.which;
            if (code === $.ui.keyCode.ENTER) {
                addSelectedControllerService();
            } else {
                applyControllerServiceTypeFilter();
            }
        }).focus(function () {
            if ($(this).hasClass(config.styles.filterList)) {
                $(this).removeClass(config.styles.filterList).val('');
            }
        }).blur(function () {
            if ($(this).val() === '') {
                $(this).addClass(config.styles.filterList).val(config.filterText);
            }
        }).addClass(config.styles.filterList).val(config.filterText);

        // initialize the processor type table
        var controllerServiceTypesColumns = [
            {
                id: 'type',
                name: 'Type',
                field: 'label',
                sortable: false,
                resizable: true,
                formatter: nf.Common.genericValueFormatter
            },
            {
                id: 'tags',
                name: 'Tags',
                field: 'tags',
                sortable: false,
                resizable: true,
                formatter: nf.Common.genericValueFormatter
            }
        ];

        // initialize the dataview
        var controllerServiceTypesData = new Slick.Data.DataView({
            inlineFilters: false
        });
        controllerServiceTypesData.setItems([]);
        controllerServiceTypesData.setFilterArgs({
            searchString: getControllerServiceTypeFilterText()
        });
        controllerServiceTypesData.setFilter(filterControllerServiceTypes);

        // initialize the grid
        var controllerServiceTypesGrid = new Slick.Grid('#controller-service-types-table', controllerServiceTypesData, controllerServiceTypesColumns, gridOptions);
        controllerServiceTypesGrid.setSelectionModel(new Slick.RowSelectionModel());
        controllerServiceTypesGrid.registerPlugin(new Slick.AutoTooltips());
        controllerServiceTypesGrid.setSortColumn('type', true);
        controllerServiceTypesGrid.onSelectedRowsChanged.subscribe(function (e, args) {
            if ($.isArray(args.rows) && args.rows.length === 1) {
                var controllerServiceTypeIndex = args.rows[0];
                var controllerServiceType = controllerServiceTypesGrid.getDataItem(controllerServiceTypeIndex);

                // set the controller service type description
                if (nf.Common.isDefinedAndNotNull(controllerServiceType)) {
                    if (nf.Common.isBlank(controllerServiceType.description)) {
                        $('#controller-service-type-description').attr('title', '').html('<span class="unset">No description specified</span>');
                    } else {
                        $('#controller-service-type-description').html(controllerServiceType.description).ellipsis();
                    }

                    // populate the dom
                    $('#controller-service-type-name').text(controllerServiceType.label).ellipsis();
                    $('#selected-controller-service-name').text(controllerServiceType.label);
                    $('#selected-controller-service-type').text(controllerServiceType.type);

                    // show the selected controller service
                    $('#controller-service-description-container').show();
                }
            }
        });
        controllerServiceTypesGrid.onDblClick.subscribe(function (e, args) {
            var controllerServiceType = controllerServiceTypesGrid.getDataItem(args.row);
            addControllerService(controllerServiceType.type);
        });

        // wire up the dataview to the grid
        controllerServiceTypesData.onRowCountChanged.subscribe(function (e, args) {
            controllerServiceTypesGrid.updateRowCount();
            controllerServiceTypesGrid.render();

            // update the total number of displayed processors
            $('#displayed-controller-service-types').text(args.current);
        });
        controllerServiceTypesData.onRowsChanged.subscribe(function (e, args) {
            controllerServiceTypesGrid.invalidateRows(args.rows);
            controllerServiceTypesGrid.render();
        });
        controllerServiceTypesData.syncGridSelection(controllerServiceTypesGrid, true);

        // hold onto an instance of the grid
        $('#controller-service-types-table').data('gridInstance', controllerServiceTypesGrid);

        // load the available controller services
        $.ajax({
            type: 'GET',
            url: config.urls.controllerServiceTypes,
            dataType: 'json'
        }).done(function (response) {
            var id = 0;
            var tags = [];

            // begin the update
            controllerServiceTypesData.beginUpdate();

            // go through each controller service type
            $.each(response.controllerServiceTypes, function (i, documentedType) {
                // add the documented type
                controllerServiceTypesData.addItem({
                    id: id++,
                    label: nf.Common.substringAfterLast(documentedType.type, '.'),
                    type: documentedType.type,
                    description: nf.Common.escapeHtml(documentedType.description),
                    tags: documentedType.tags.join(', ')
                });

                // count the frequency of each tag for this type
                $.each(documentedType.tags, function (i, tag) {
                    tags.push(tag.toLowerCase());
                });
            });

            // end the udpate
            controllerServiceTypesData.endUpdate();

            // set the total number of processors
            $('#total-controller-service-types, #displayed-controller-service-types').text(response.controllerServiceTypes.length);

            // create the tag cloud
            $('#controller-service-tag-cloud').tagcloud({
                tags: tags,
                select: applyControllerServiceTypeFilter,
                remove: applyControllerServiceTypeFilter
            });
        }).fail(nf.Common.handleAjaxError);

        // initialize the controller service dialog
        $('#new-controller-service-dialog').modal({
            headerText: 'Add Controller Service',
            overlayBackground: false,
            buttons: [{
                buttonText: 'Add',
                handler: {
                    click: function () {
                        addSelectedControllerService();
                    }
                }
            }, {
                buttonText: 'Cancel',
                handler: {
                    click: function () {
                        $(this).modal('hide');
                    }
                }
            }],
            handler: {
                close: function () {
                    // reset the node availability
                    if (nf.Canvas.isClustered()) {
                        $('#controller-service-availability-combo').combo('setSelectedOption', {
                            value: config.node
                        });
                    }

                    // clear the selected row
                    clearSelectedControllerService();

                    // clear any filter strings
                    $('#controller-service-type-filter').addClass(config.styles.filterList).val(config.filterText);

                    // clear the tagcloud
                    $('#controller-service-tag-cloud').tagcloud('clearSelectedTags');

                    // reset the filter
                    applyControllerServiceTypeFilter();

                    // unselect any current selection
                    var processTypesGrid = $('#controller-service-types-table').data('gridInstance');
                    processTypesGrid.setSelectedRows([]);
                    processTypesGrid.resetActiveCell();
                }
            }
        }).draggable({
            containment: 'parent',
            handle: '.dialog-header'
        });
    };

    /**
     * Formatter for the type column.
     *
     * @param {type} row
     * @param {type} cell
     * @param {type} value
     * @param {type} columnDef
     * @param {type} dataContext
     * @returns {String}
     */
    var typeFormatter = function (row, cell, value, columnDef, dataContext) {
        return nf.Common.substringAfterLast(nf.Common.escapeHtml(value), '.');
    };

    /**
     * Formatter for the availability column.
     *
     * @param {type} row
     * @param {type} cell
     * @param {type} value
     * @param {type} columnDef
     * @param {type} dataContext
     * @returns {String}
     */
    var availabilityFormatter = function (row, cell, value, columnDef, dataContext) {
        if (value === config.node) {
            return 'Node';
        } else {
            return 'Cluster Manager';
        }
    };

    /**
     * Sorts the specified data using the specified sort details.
     *
     * @param {object} sortDetails
     * @param {object} data
     */
    var sort = function (sortDetails, data) {
        // defines a function for sorting
        var comparer = function (a, b) {
            if (sortDetails.columnId === 'moreDetails') {
                var aBulletins = 0;
                if (!nf.Common.isEmpty(a.bulletins)) {
                    aBulletins = a.bulletins.length;
                }
                var bBulletins = 0;
                if (!nf.Common.isEmpty(b.bulletins)) {
                    bBulletins = b.bulletins.length;
                }
                return aBulletins - bBulletins;
            } else if (sortDetails.columnId === 'type') {
                var aType = nf.Common.isDefinedAndNotNull(a[sortDetails.columnId]) ? nf.Common.substringAfterLast(a[sortDetails.columnId], '.') : '';
                var bType = nf.Common.isDefinedAndNotNull(b[sortDetails.columnId]) ? nf.Common.substringAfterLast(b[sortDetails.columnId], '.') : '';
                return aType === bType ? 0 : aType > bType ? 1 : -1;
            } else if (sortDetails.columnId === 'state') {
                var aState = 'Invalid';
                if (nf.Common.isEmpty(a.validationErrors)) {
                    aState = nf.Common.isDefinedAndNotNull(a[sortDetails.columnId]) ? a[sortDetails.columnId] : '';
                }
                var bState = 'Invalid';
                if (nf.Common.isEmpty(b.validationErrors)) {
                    bState = nf.Common.isDefinedAndNotNull(b[sortDetails.columnId]) ? b[sortDetails.columnId] : '';
                }
                return aState === bState ? 0 : aState > bState ? 1 : -1;
            } else {
                var aString = nf.Common.isDefinedAndNotNull(a[sortDetails.columnId]) ? a[sortDetails.columnId] : '';
                var bString = nf.Common.isDefinedAndNotNull(b[sortDetails.columnId]) ? b[sortDetails.columnId] : '';
                return aString === bString ? 0 : aString > bString ? 1 : -1;
            }
        };

        // perform the sort
        data.sort(comparer, sortDetails.sortAsc);
    };

    /**
     * Initializes the controller services tab.
     */
    var initControllerServices = function () {
        // initialize the new controller service dialog
        initNewControllerServiceDialog();

        // more details formatter
        var moreControllerServiceDetails = function (row, cell, value, columnDef, dataContext) {
            var markup = '<img src="images/iconDetails.png" title="View Details" class="pointer view-controller-service" style="margin-top: 5px; float: left;" />';

            // always include a button to view the usage
            markup += '<img src="images/iconUsage.png" title="Usage" class="pointer controller-service-usage" style="margin-left: 6px; margin-top: 3px; float: left;" />';

            var hasErrors = !nf.Common.isEmpty(dataContext.validationErrors);
            var hasBulletins = !nf.Common.isEmpty(dataContext.bulletins);

            if (hasErrors) {
                markup += '<img src="images/iconAlert.png" class="has-errors" style="margin-top: 4px; margin-left: 3px; float: left;" />';
            }

            if (hasBulletins) {
                markup += '<img src="images/iconBulletin.png" class="has-bulletins" style="margin-top: 5px; margin-left: 5px; float: left;"/>';
            }

            if (hasErrors || hasBulletins) {
                markup += '<span class="hidden row-id">' + nf.Common.escapeHtml(dataContext.id) + '</span>';
            }

            return markup;
        };

        var controllerServiceStateFormatter = function (row, cell, value, columnDef, dataContext) {
            // determine the appropriate label
            var icon = '', label = '';
            if (!nf.Common.isEmpty(dataContext.validationErrors)) {
                icon = 'invalid';
                label = 'Invalid';
            } else {
                if (value === 'DISABLED') {
                    icon = 'disabled';
                    label = 'Disabled';
                } else if (value === 'DISABLING') {
                    icon = 'disabled';
                    label = 'Disabling';
                } else if (value === 'ENABLED') {
                    icon = 'enabled';
                    label = 'Enabled';
                } else if (value === 'ENABLING') {
                    icon = 'enabled';
                    label = 'Enabling';
                }
            }

            // format the markup
            var formattedValue = '<div class="' + icon + '" style="margin-top: 3px;"></div>';
            return formattedValue + '<div class="status-text" style="margin-top: 2px; margin-left: 4px; float: left;">' + label + '</div>';
        };

        var controllerServiceActionFormatter = function (row, cell, value, columnDef, dataContext) {
            var markup = '';

            // only DFMs can edit a controller service and view state
            if (nf.Common.isDFM()) {
                if (dataContext.state === 'ENABLED' || dataContext.state === 'ENABLING') {
                    markup += '<img src="images/iconDisable.png" title="Disable" class="pointer disable-controller-service" style="margin-top: 2px;" />';
                } else if (dataContext.state === 'DISABLED') {
                    markup += '<img src="images/iconEdit.png" title="Edit" class="pointer edit-controller-service" style="margin-top: 2px;" />';

                    // if there are no validation errors allow enabling
                    if (nf.Common.isEmpty(dataContext.validationErrors)) {
                        markup += '<img src="images/iconEnable.png" title="Enable" class="pointer enable-controller-service" style="margin-top: 2px; margin-left: 3px;"/>';
                    }

                    markup += '<img src="images/iconDelete.png" title="Remove" class="pointer delete-controller-service" style="margin-top: 2px; margin-left: 3px;" />';
                }

                if (dataContext.persistsState === true) {
                    markup += '<img src="images/iconViewState.png" title="View State" class="pointer view-state-controller-service" style="margin-top: 2px; margin-left: 3px;" />';
                }
            }


            return markup;
        };

        // define the column model for the controller services table
        var controllerServicesColumns = [
            {
                id: 'moreDetails',
                field: 'moreDetails',
                name: '&nbsp;',
                resizable: false,
                formatter: moreControllerServiceDetails,
                sortable: true,
                width: 90,
                maxWidth: 90,
                toolTip: 'Sorts based on presence of bulletins'
            },
            {
                id: 'name',
                field: 'name',
                name: 'Name',
                sortable: true,
                resizable: true,
                formatter: nf.Common.genericValueFormatter
            },
            {
                id: 'type',
                field: 'type',
                name: 'Type',
                formatter: typeFormatter,
                sortable: true,
                resizable: true
            },
            {
                id: 'state',
                field: 'state',
                name: 'State',
                formatter: controllerServiceStateFormatter,
                sortable: true,
                resizeable: true
            }
        ];

        // only show availability when clustered
        if (nf.Canvas.isClustered()) {
            controllerServicesColumns.push(
                {
                    id: 'availability',
                    field: 'availability',
                    name: 'Availability',
                    formatter: availabilityFormatter,
                    sortable: true,
                    resizeable: true
                });
        }

        // action column should always be last
        controllerServicesColumns.push(
            {
                id: 'actions',
                name: '&nbsp;',
                resizable: false,
                formatter: controllerServiceActionFormatter,
                sortable: false,
                width: 90,
                maxWidth: 90
            });

        // initialize the dataview
        var controllerServicesData = new Slick.Data.DataView({
            inlineFilters: false
        });
        controllerServicesData.setItems([]);

        // initialize the sort
        sort({
            columnId: 'name',
            sortAsc: true
        }, controllerServicesData);

        // initialize the grid
        var controllerServicesGrid = new Slick.Grid('#controller-services-table', controllerServicesData, controllerServicesColumns, gridOptions);
        controllerServicesGrid.setSelectionModel(new Slick.RowSelectionModel());
        controllerServicesGrid.registerPlugin(new Slick.AutoTooltips());
        controllerServicesGrid.setSortColumn('name', true);
        controllerServicesGrid.onSort.subscribe(function (e, args) {
            sort({
                columnId: args.sortCol.field,
                sortAsc: args.sortAsc
            }, controllerServicesData);
        });

        // configure a click listener
        controllerServicesGrid.onClick.subscribe(function (e, args) {
            var target = $(e.target);

            // get the service at this row
            var controllerService = controllerServicesData.getItem(args.row);

            // determine the desired action
            if (controllerServicesGrid.getColumns()[args.cell].id === 'actions') {
                if (target.hasClass('edit-controller-service')) {
                    nf.ControllerService.showConfiguration(controllerService);
                } else if (target.hasClass('enable-controller-service')) {
                    nf.ControllerService.enable(controllerService);
                } else if (target.hasClass('disable-controller-service')) {
                    nf.ControllerService.disable(controllerService);
                } else if (target.hasClass('delete-controller-service')) {
                    nf.ControllerService.remove(controllerService);
                } else if (target.hasClass('view-state-controller-service')) {
                    nf.ComponentState.showState(controllerService, controllerService.state === 'DISABLED');
                }
            } else if (controllerServicesGrid.getColumns()[args.cell].id === 'moreDetails') {
                if (target.hasClass('view-controller-service')) {
                    nf.ControllerService.showDetails(controllerService);
                } else if (target.hasClass('controller-service-usage')) {
                     // close the settings dialog
                     $('#shell-close-button').click();

                     // open the documentation for this controller service
                     nf.Shell.showPage('../nifi-docs/documentation?' + $.param({
                         select: nf.Common.substringAfterLast(controllerService.type, '.')
                     })).done(function() {
                         nf.Settings.showSettings();
                     });
                 }
            }
        });

        // wire up the dataview to the grid
        controllerServicesData.onRowCountChanged.subscribe(function (e, args) {
            controllerServicesGrid.updateRowCount();
            controllerServicesGrid.render();
        });
        controllerServicesData.onRowsChanged.subscribe(function (e, args) {
            controllerServicesGrid.invalidateRows(args.rows);
            controllerServicesGrid.render();
        });
        controllerServicesData.syncGridSelection(controllerServicesGrid, true);

        // hold onto an instance of the grid
        $('#controller-services-table').data('gridInstance', controllerServicesGrid).on('mouseenter', 'div.slick-cell', function (e) {
            var errorIcon = $(this).find('img.has-errors');
            if (errorIcon.length && !errorIcon.data('qtip')) {
                var serviceId = $(this).find('span.row-id').text();

                // get the service item
                var item = controllerServicesData.getItemById(serviceId);

                // format the errors
                var tooltip = nf.Common.formatUnorderedList(item.validationErrors);

                // show the tooltip
                if (nf.Common.isDefinedAndNotNull(tooltip)) {
                    errorIcon.qtip($.extend({
                        content: tooltip,
                        position: {
                            target: 'mouse',
                            viewport: $(window),
                            adjust: {
                                x: 8,
                                y: 8,
                                method: 'flipinvert flipinvert'
                            }
                        }
                    }, nf.Common.config.tooltipConfig));
                }
            }

            var bulletinIcon = $(this).find('img.has-bulletins');
            if (bulletinIcon.length && !bulletinIcon.data('qtip')) {
                var taskId = $(this).find('span.row-id').text();

                // get the task item
                var item = controllerServicesData.getItemById(taskId);

                // format the tooltip
                var bulletins = nf.Common.getFormattedBulletins(item.bulletins);
                var tooltip = nf.Common.formatUnorderedList(bulletins);

                // show the tooltip
                if (nf.Common.isDefinedAndNotNull(tooltip)) {
                    bulletinIcon.qtip($.extend({}, nf.Common.config.tooltipConfig, {
                        content: tooltip,
                        position: {
                            target: 'mouse',
                            viewport: $(window),
                            adjust: {
                                x: 8,
                                y: 8,
                                method: 'flipinvert flipinvert'
                            }
                        }
                    }));
                }
            }
        });
    };

    /**
     * Loads the controller services.
     */
    var loadControllerServices = function () {
        var services = [];

        // get the controller services that are running on the nodes
        var nodeControllerServices = $.ajax({
            type: 'GET',
            url: config.urls.controllerServices + '/' + encodeURIComponent(config.node),
            dataType: 'json'
        }).done(function (response) {
            var nodeServices = response.controllerServices;
            if (nf.Common.isDefinedAndNotNull(nodeServices)) {
                $.each(nodeServices, function (_, nodeService) {
                    services.push($.extend({
                        bulletins: []
                    }, nodeService));
                });
            }
        });

        // get the controller services that are running on the ncm
        var ncmControllerServices = $.Deferred(function (deferred) {
            if (nf.Canvas.isClustered()) {
                $.ajax({
                    type: 'GET',
                    url: config.urls.controllerServices + '/' + encodeURIComponent(config.ncm),
                    dataType: 'json'
                }).done(function (response) {
                    var ncmServices = response.controllerServices;
                    if (nf.Common.isDefinedAndNotNull(ncmServices)) {
                        $.each(ncmServices, function (_, ncmService) {
                            services.push($.extend({
                                bulletins: []
                            }, ncmService));
                        });
                    }
                    deferred.resolve();
                }).fail(function () {
                    deferred.reject();
                });
            } else {
                deferred.resolve();
            }
        }).promise();

        // add all controller services
        return $.when(nodeControllerServices, ncmControllerServices).done(function () {
            var controllerServicesElement = $('#controller-services-table');
            nf.Common.cleanUpTooltips(controllerServicesElement, 'img.has-errors');
            nf.Common.cleanUpTooltips(controllerServicesElement, 'img.has-bulletins');

            var controllerServicesGrid = controllerServicesElement.data('gridInstance');
            var controllerServicesData = controllerServicesGrid.getData();

            // update the controller services
            controllerServicesData.setItems(services);
            controllerServicesData.reSort();
            controllerServicesGrid.invalidate();
        });
    };

    /**
     * Get the text out of the filter field. If the filter field doesn't
     * have any text it will contain the text 'filter list' so this method
     * accounts for that.
     */
    var getReportingTaskTypeFilterText = function () {
        var filterText = '';
        var filterField = $('#reporting-task-type-filter');
        if (!filterField.hasClass(config.styles.filterList)) {
            filterText = filterField.val();
        }
        return filterText;
    };

    /**
     * Filters the reporting task type table.
     */
    var applyReportingTaskTypeFilter = function () {
        // get the dataview
        var reportingTaskTypesGrid = $('#reporting-task-types-table').data('gridInstance');

        // ensure the grid has been initialized
        if (nf.Common.isDefinedAndNotNull(reportingTaskTypesGrid)) {
            var reportingTaskTypesData = reportingTaskTypesGrid.getData();

            // update the search criteria
            reportingTaskTypesData.setFilterArgs({
                searchString: getReportingTaskTypeFilterText()
            });
            reportingTaskTypesData.refresh();

            // update the selection if possible
            if (reportingTaskTypesData.getLength() > 0) {
                reportingTaskTypesGrid.setSelectedRows([0]);
            }
        }
    };

    /**
     * Hides the selected reporting task.
     */
    var clearSelectedReportingTask = function () {
        $('#reporting-task-type-description').text('');
        $('#reporting-task-type-name').text('');
        $('#selected-reporting-task-name').text('');
        $('#selected-reporting-task-type').text('');
        $('#reporting-task-description-container').hide();
    };

    /**
     * Clears the selected reporting task type.
     */
    var clearReportingTaskSelection = function () {
        // clear the selected row
        clearSelectedReportingTask();

        // clear the active cell the it can be reselected when its included
        var reportingTaskTypesGrid = $('#reporting-task-types-table').data('gridInstance');
        reportingTaskTypesGrid.resetActiveCell();
    };

    /**
     * Performs the filtering.
     *
     * @param {object} item     The item subject to filtering
     * @param {object} args     Filter arguments
     * @returns {Boolean}       Whether or not to include the item
     */
    var filterReportingTaskTypes = function (item, args) {
        // determine if the item matches the filter
        var matchesFilter = matchesRegex(item, args);

        // determine if the row matches the selected tags
        var matchesTags = true;
        if (matchesFilter) {
            var tagFilters = $('#reporting-task-tag-cloud').tagcloud('getSelectedTags');
            var hasSelectedTags = tagFilters.length > 0;
            if (hasSelectedTags) {
                matchesTags = matchesSelectedTags(tagFilters, item['tags']);
            }
        }

        // determine if this row should be visible
        var matches = matchesFilter && matchesTags;

        // if this row is currently selected and its being filtered
        if (matches === false && $('#selected-reporting-task-type').text() === item['type']) {
            clearReportingTaskSelection();
        }

        return matches;
    };

    /**
     * Adds the currently selected reporting task.
     */
    var addSelectedReportingTask = function () {
        var selectedTaskType = $('#selected-reporting-task-type').text();

        // ensure something was selected
        if (selectedTaskType === '') {
            nf.Dialog.showOkDialog({
                dialogContent: 'The type of reporting task to create must be selected.',
                overlayBackground: false
            });
        } else {
            addReportingTask(selectedTaskType);
        }
    };

    /**
     * Adds a new reporting task of the specified type.
     *
     * @param {string} reportingTaskType
     */
    var addReportingTask = function (reportingTaskType) {
        var revision = nf.Client.getRevision();

        // get the desired availability
        var availability;
        if (nf.Canvas.isClustered()) {
            availability = $('#reporting-task-availability-combo').combo('getSelectedOption').value;
        } else {
            availability = config.node;
        }

        // add the new reporting task
        var addTask = $.ajax({
            type: 'POST',
            url: config.urls.reportingTasks + '/' + encodeURIComponent(availability),
            data: {
                version: revision.version,
                clientId: revision.clientId,
                type: reportingTaskType
            },
            dataType: 'json'
        }).done(function (response) {
            // update the revision
            nf.Client.setRevision(response.revision);

            // add the item
            var reportingTask = response.reportingTask;
            var reportingTaskGrid = $('#reporting-tasks-table').data('gridInstance');
            var reportingTaskData = reportingTaskGrid.getData();
            reportingTaskData.addItem(reportingTask);

            // resort
            reportingTaskData.reSort();
            reportingTaskGrid.invalidate();

            // select the new reporting task
            var row = reportingTaskData.getRowById(reportingTask.id);
            reportingTaskGrid.setSelectedRows([row]);
            reportingTaskGrid.scrollRowIntoView(row);
        }).fail(nf.Common.handleAjaxError);

        // hide the dialog
        $('#new-reporting-task-dialog').modal('hide');

        return addTask;
    };

    /**
     * Initializes the new reporting task dialog.
     */
    var initNewReportingTaskDialog = function () {
        // specify the reporting task availability
        if (nf.Canvas.isClustered()) {
            $('#reporting-task-availability-combo').combo({
                options: [{
                    text: 'Node',
                    value: config.node,
                    description: 'This reporting task will be available on the nodes only.'
                }, {
                    text: 'Cluster Manager',
                    value: config.ncm,
                    description: 'This reporting task will be available on the cluster manager only.'
                }]
            });
            $('#reporting-task-availability-container').show();
        }

        // define the function for filtering the list
        $('#reporting-task-type-filter').on('keyup', function (e) {
            var code = e.keyCode ? e.keyCode : e.which;
            if (code === $.ui.keyCode.ENTER) {
                addSelectedReportingTask();
            } else {
                applyReportingTaskTypeFilter();
            }
        }).focus(function () {
            if ($(this).hasClass(config.styles.filterList)) {
                $(this).removeClass(config.styles.filterList).val('');
            }
        }).blur(function () {
            if ($(this).val() === '') {
                $(this).addClass(config.styles.filterList).val(config.filterText);
            }
        }).addClass(config.styles.filterList).val(config.filterText);

        // initialize the processor type table
        var reportingTaskTypesColumns = [
            {
                id: 'type',
                name: 'Type',
                field: 'label',
                sortable: false,
                resizable: true,
                formatter: nf.Common.genericValueFormatter
            },
            {
                id: 'tags',
                name: 'Tags',
                field: 'tags',
                sortable: false,
                resizable: true,
                formatter: nf.Common.genericValueFormatter
            }
        ];

        // initialize the dataview
        var reportingTaskTypesData = new Slick.Data.DataView({
            inlineFilters: false
        });
        reportingTaskTypesData.setItems([]);
        reportingTaskTypesData.setFilterArgs({
            searchString: getReportingTaskTypeFilterText()
        });
        reportingTaskTypesData.setFilter(filterReportingTaskTypes);

        // initialize the grid
        var reportingTaskTypesGrid = new Slick.Grid('#reporting-task-types-table', reportingTaskTypesData, reportingTaskTypesColumns, gridOptions);
        reportingTaskTypesGrid.setSelectionModel(new Slick.RowSelectionModel());
        reportingTaskTypesGrid.registerPlugin(new Slick.AutoTooltips());
        reportingTaskTypesGrid.setSortColumn('type', true);
        reportingTaskTypesGrid.onSelectedRowsChanged.subscribe(function (e, args) {
            if ($.isArray(args.rows) && args.rows.length === 1) {
                var reportingTaskTypeIndex = args.rows[0];
                var reportingTaskType = reportingTaskTypesGrid.getDataItem(reportingTaskTypeIndex);

                // set the reporting task type description
                if (nf.Common.isDefinedAndNotNull(reportingTaskType)) {
                    if (nf.Common.isBlank(reportingTaskType.description)) {
                        $('#reporting-task-type-description').attr('title', '').html('<span class="unset">No description specified</span>');
                    } else {
                        $('#reporting-task-type-description').html(reportingTaskType.description).ellipsis();
                    }

                    // populate the dom
                    $('#reporting-task-type-name').text(reportingTaskType.label).ellipsis();
                    $('#selected-reporting-task-name').text(reportingTaskType.label);
                    $('#selected-reporting-task-type').text(reportingTaskType.type);

                    // show the selected reporting task
                    $('#reporting-task-description-container').show();
                }
            }
        });
        reportingTaskTypesGrid.onDblClick.subscribe(function (e, args) {
            var reportingTaskType = reportingTaskTypesGrid.getDataItem(args.row);
            addReportingTask(reportingTaskType.type);
        });

        // wire up the dataview to the grid
        reportingTaskTypesData.onRowCountChanged.subscribe(function (e, args) {
            reportingTaskTypesGrid.updateRowCount();
            reportingTaskTypesGrid.render();

            // update the total number of displayed processors
            $('#displayed-reporting-task-types').text(args.current);
        });
        reportingTaskTypesData.onRowsChanged.subscribe(function (e, args) {
            reportingTaskTypesGrid.invalidateRows(args.rows);
            reportingTaskTypesGrid.render();
        });
        reportingTaskTypesData.syncGridSelection(reportingTaskTypesGrid, true);

        // hold onto an instance of the grid
        $('#reporting-task-types-table').data('gridInstance', reportingTaskTypesGrid);

        // load the available reporting tasks
        $.ajax({
            type: 'GET',
            url: config.urls.reportingTaskTypes,
            dataType: 'json'
        }).done(function (response) {
            var id = 0;
            var tags = [];

            // begin the update
            reportingTaskTypesData.beginUpdate();

            // go through each reporting task type
            $.each(response.reportingTaskTypes, function (i, documentedType) {
                // add the documented type
                reportingTaskTypesData.addItem({
                    id: id++,
                    label: nf.Common.substringAfterLast(documentedType.type, '.'),
                    type: documentedType.type,
                    description: nf.Common.escapeHtml(documentedType.description),
                    tags: documentedType.tags.join(', ')
                });

                // count the frequency of each tag for this type
                $.each(documentedType.tags, function (i, tag) {
                    tags.push(tag.toLowerCase());
                });
            });

            // end the udpate
            reportingTaskTypesData.endUpdate();

            // set the total number of processors
            $('#total-reporting-task-types, #displayed-reporting-task-types').text(response.reportingTaskTypes.length);

            // create the tag cloud
            $('#reporting-task-tag-cloud').tagcloud({
                tags: tags,
                select: applyReportingTaskTypeFilter,
                remove: applyReportingTaskTypeFilter
            });
        }).fail(nf.Common.handleAjaxError);

        // initialize the reporting task dialog
        $('#new-reporting-task-dialog').modal({
            headerText: 'Add Reporting Task',
            overlayBackground: false,
            buttons: [{
                buttonText: 'Add',
                handler: {
                    click: function () {
                        addSelectedReportingTask();
                    }
                }
            }, {
                buttonText: 'Cancel',
                handler: {
                    click: function () {
                        $(this).modal('hide');
                    }
                }
            }],
            handler: {
                close: function () {
                    // reset the node availability
                    if (nf.Canvas.isClustered()) {
                        $('#reporting-task-availability-combo').combo('setSelectedOption', {
                            value: config.node
                        });
                    }

                    // clear the selected row
                    clearSelectedReportingTask();

                    // clear any filter strings
                    $('#reporting-task-type-filter').addClass(config.styles.filterList).val(config.filterText);

                    // clear the tagcloud
                    $('#reporting-task-tag-cloud').tagcloud('clearSelectedTags');

                    // reset the filter
                    applyReportingTaskTypeFilter();

                    // unselect any current selection
                    var reportingTaskTypesGrid = $('#reporting-task-types-table').data('gridInstance');
                    reportingTaskTypesGrid.setSelectedRows([]);
                    reportingTaskTypesGrid.resetActiveCell();
                }
            }
        }).draggable({
            containment: 'parent',
            handle: '.dialog-header'
        });
    };

    /**
     * Initializes the reporting tasks tab.
     */
    var initReportingTasks = function () {
        // initialize the new reporting task dialog
        initNewReportingTaskDialog();

        var moreReportingTaskDetails = function (row, cell, value, columnDef, dataContext) {
            var markup = '<img src="images/iconDetails.png" title="View Details" class="pointer view-reporting-task" style="margin-top: 5px; float: left;" />';

            // always include a button to view the usage
            markup += '<img src="images/iconUsage.png" title="Usage" class="pointer reporting-task-usage" style="margin-left: 6px; margin-top: 3px;"/>';

            var hasErrors = !nf.Common.isEmpty(dataContext.validationErrors);
            var hasBulletins = !nf.Common.isEmpty(dataContext.bulletins);

            if (hasErrors) {
                markup += '<img src="images/iconAlert.png" class="has-errors" style="margin-top: 4px; margin-left: 3px; float: left;" />';
            }

            if (hasBulletins) {
                markup += '<img src="images/iconBulletin.png" class="has-bulletins" style="margin-top: 5px; margin-left: 5px; float: left;"/>';
            }

            if (hasErrors || hasBulletins) {
                markup += '<span class="hidden row-id">' + nf.Common.escapeHtml(dataContext.id) + '</span>';
            }

            return markup;
        };

        var reportingTaskRunStatusFormatter = function (row, cell, value, columnDef, dataContext) {
            // determine the appropriate label
            var label;
            if (!nf.Common.isEmpty(dataContext.validationErrors)) {
                label = 'Invalid';
            } else {
                if (value === 'STOPPED') {
                    label = 'Stopped';
                } else if (value === 'RUNNING') {
                    label = 'Running';
                } else {
                    label = 'Disabled';
                }
            }

            // include the active thread count if appropriate
            var activeThreadCount = '';
            if (nf.Common.isDefinedAndNotNull(dataContext.activeThreadCount) && dataContext.activeThreadCount > 0) {
                activeThreadCount = '(' + dataContext.activeThreadCount + ')';
            }

            // format the markup
            var formattedValue = '<div class="' + nf.Common.escapeHtml(label.toLowerCase()) + '" style="margin-top: 3px;"></div>';
            return formattedValue + '<div class="status-text" style="margin-top: 2px; margin-left: 4px; float: left;">' + nf.Common.escapeHtml(label) + '</div><div style="float: left; margin-left: 4px;">' + nf.Common.escapeHtml(activeThreadCount) + '</div>';
        };

        var reportingTaskActionFormatter = function (row, cell, value, columnDef, dataContext) {
            var markup = '';

            // only DFMs can edit reporting tasks and view state
            if (nf.Common.isDFM()) {
                if (dataContext.state === 'RUNNING') {
                    markup += '<img src="images/iconStop.png" title="Stop" class="pointer stop-reporting-task" style="margin-top: 2px;" />';
                } else if (dataContext.state === 'STOPPED' || dataContext.state === 'DISABLED') {
                    markup += '<img src="images/iconEdit.png" title="Edit" class="pointer edit-reporting-task" style="margin-top: 2px;" />';

                    // support starting when stopped and no validation errors
                    if (dataContext.state === 'STOPPED' && nf.Common.isEmpty(dataContext.validationErrors)) {
                        markup += '<img src="images/iconRun.png" title="Start" class="pointer start-reporting-task" style="margin-top: 2px; margin-left: 3px;"/>';
                    }

                    markup += '<img src="images/iconDelete.png" title="Remove" class="pointer delete-reporting-task" style="margin-top: 2px; margin-left: 3px;" />';
                }

                if (dataContext.persistsState === true) {
                    markup += '<img src="images/iconViewState.png" title="View State" class="pointer view-state-reporting-task" style="margin-top: 2px; margin-left: 3px;" />';
                }
            }


            return markup;
        };

        // define the column model for the reporting tasks table
        var reportingTasksColumnModel = [
            {
                id: 'moreDetails',
                field: 'moreDetails',
                name: '&nbsp;',
                resizable: false,
                formatter: moreReportingTaskDetails,
                sortable: true,
                width: 90,
                maxWidth: 90,
                toolTip: 'Sorts based on presence of bulletins'
            },
            {
                id: 'name',
                field: 'name',
                name: 'Name',
                sortable: true,
                resizable: true,
                formatter: nf.Common.genericValueFormatter
            },
            {
                id: 'type',
                field: 'type',
                name: 'Type',
                sortable: true,
                resizable: true,
                formatter: typeFormatter
            },
            {
                id: 'state',
                field: 'state',
                name: 'Run Status',
                sortable: true,
                resizeable: true,
                formatter: reportingTaskRunStatusFormatter
            }
        ];

        // only show availability when clustered
        if (nf.Canvas.isClustered()) {
            reportingTasksColumnModel.push(
                {
                    id: 'availability',
                    field: 'availability',
                    name: 'Availability',
                    formatter: availabilityFormatter,
                    sortable: true,
                    resizeable: true
                });
        }

        // action column should always be last
        reportingTasksColumnModel.push(
            {
                id: 'actions',
                name: '&nbsp;',
                resizable: false,
                formatter: reportingTaskActionFormatter,
                sortable: false,
                width: 90,
                maxWidth: 90
            });

        // initialize the dataview
        var reportingTasksData = new Slick.Data.DataView({
            inlineFilters: false
        });
        reportingTasksData.setItems([]);

        // initialize the sort
        sort({
            columnId: 'name',
            sortAsc: true
        }, reportingTasksData);

        // initialize the grid
        var reportingTasksGrid = new Slick.Grid('#reporting-tasks-table', reportingTasksData, reportingTasksColumnModel, gridOptions);
        reportingTasksGrid.setSelectionModel(new Slick.RowSelectionModel());
        reportingTasksGrid.registerPlugin(new Slick.AutoTooltips());
        reportingTasksGrid.setSortColumn('name', true);
        reportingTasksGrid.onSort.subscribe(function (e, args) {
            sort({
                columnId: args.sortCol.field,
                sortAsc: args.sortAsc
            }, reportingTasksData);
        });

        // configure a click listener
        reportingTasksGrid.onClick.subscribe(function (e, args) {
            var target = $(e.target);

            // get the service at this row
            var reportingTask = reportingTasksData.getItem(args.row);

            // determine the desired action
            if (reportingTasksGrid.getColumns()[args.cell].id === 'actions') {
                if (target.hasClass('edit-reporting-task')) {
                    nf.ReportingTask.showConfiguration(reportingTask);
                } else if (target.hasClass('start-reporting-task')) {
                    nf.ReportingTask.start(reportingTask);
                } else if (target.hasClass('stop-reporting-task')) {
                    nf.ReportingTask.stop(reportingTask);
                } else if (target.hasClass('delete-reporting-task')) {
                    nf.ReportingTask.remove(reportingTask);
                } else if (target.hasClass('view-state-reporting-task')) {
                    var canClear = reportingTask.state === 'STOPPED' && reportingTask.activeThreadCount === 0;
                    nf.ComponentState.showState(reportingTask, canClear);
                }
            } else if (reportingTasksGrid.getColumns()[args.cell].id === 'moreDetails') {
                if (target.hasClass('view-reporting-task')) {
                    nf.ReportingTask.showDetails(reportingTask);
                } else if (target.hasClass('reporting-task-usage')) {
                     // close the settings dialog
                     $('#shell-close-button').click();

                     // open the documentation for this reporting task
                     nf.Shell.showPage('../nifi-docs/documentation?' + $.param({
                         select: nf.Common.substringAfterLast(reportingTask.type, '.')
                     })).done(function() {
                         nf.Settings.showSettings();
                     });
                 }
            }
        });

        // wire up the dataview to the grid
        reportingTasksData.onRowCountChanged.subscribe(function (e, args) {
            reportingTasksGrid.updateRowCount();
            reportingTasksGrid.render();
        });
        reportingTasksData.onRowsChanged.subscribe(function (e, args) {
            reportingTasksGrid.invalidateRows(args.rows);
            reportingTasksGrid.render();
        });
        reportingTasksData.syncGridSelection(reportingTasksGrid, true);

        // hold onto an instance of the grid
        $('#reporting-tasks-table').data('gridInstance', reportingTasksGrid).on('mouseenter', 'div.slick-cell', function (e) {
            var errorIcon = $(this).find('img.has-errors');
            if (errorIcon.length && !errorIcon.data('qtip')) {
                var taskId = $(this).find('span.row-id').text();

                // get the task item
                var item = reportingTasksData.getItemById(taskId);

                // format the errors
                var tooltip = nf.Common.formatUnorderedList(item.validationErrors);

                // show the tooltip
                if (nf.Common.isDefinedAndNotNull(tooltip)) {
                    errorIcon.qtip($.extend({
                        content: tooltip,
                        position: {
                            target: 'mouse',
                            viewport: $(window),
                            adjust: {
                                x: 8,
                                y: 8,
                                method: 'flipinvert flipinvert'
                            }
                        }
                    }, nf.Common.config.tooltipConfig));
                }
            }

            var bulletinIcon = $(this).find('img.has-bulletins');
            if (bulletinIcon.length && !bulletinIcon.data('qtip')) {
                var taskId = $(this).find('span.row-id').text();

                // get the task item
                var item = reportingTasksData.getItemById(taskId);

                // format the tooltip
                var bulletins = nf.Common.getFormattedBulletins(item.bulletins);
                var tooltip = nf.Common.formatUnorderedList(bulletins);

                // show the tooltip
                if (nf.Common.isDefinedAndNotNull(tooltip)) {
                    bulletinIcon.qtip($.extend({}, nf.Common.config.tooltipConfig, {
                        content: tooltip,
                        position: {
                            target: 'mouse',
                            viewport: $(window),
                            adjust: {
                                x: 8,
                                y: 8,
                                method: 'flipinvert flipinvert'
                            }
                        }
                    }));
                }
            }
        });
    };

    /**
     * Loads the reporting tasks.
     */
    var loadReportingTasks = function () {
        var tasks = [];

        // get the reporting tasks that are running on the nodes
        var nodeReportingTasks = $.ajax({
            type: 'GET',
            url: config.urls.reportingTasks + '/' + encodeURIComponent(config.node),
            dataType: 'json'
        }).done(function (response) {
            var nodeTasks = response.reportingTasks;
            if (nf.Common.isDefinedAndNotNull(nodeTasks)) {
                $.each(nodeTasks, function (_, nodeTask) {
                    tasks.push($.extend({
                        bulletins: []
                    }, nodeTask));
                });
            }
        });

        // get the reporting tasks that are running on the ncm
        var ncmReportingTasks = $.Deferred(function (deferred) {
            if (nf.Canvas.isClustered()) {
                $.ajax({
                    type: 'GET',
                    url: config.urls.reportingTasks + '/' + encodeURIComponent(config.ncm),
                    dataType: 'json'
                }).done(function (response) {
                    var ncmTasks = response.reportingTasks;
                    if (nf.Common.isDefinedAndNotNull(ncmTasks)) {
                        $.each(ncmTasks, function (_, ncmTask) {
                            tasks.push(ncmTask);
                        });
                    }
                    deferred.resolve();
                }).fail(function () {
                    deferred.reject();
                });
            } else {
                deferred.resolve();
            }
        }).promise();

        // add all reporting tasks
        return $.when(nodeReportingTasks, ncmReportingTasks).done(function () {
            var reportingTasksElement = $('#reporting-tasks-table');
            nf.Common.cleanUpTooltips(reportingTasksElement, 'img.has-errors');
            nf.Common.cleanUpTooltips(reportingTasksElement, 'img.has-bulletins');

            var reportingTasksGrid = reportingTasksElement.data('gridInstance');
            var reportingTasksData = reportingTasksGrid.getData();

            // update the reporting tasks
            reportingTasksData.setItems(tasks);
            reportingTasksData.reSort();
            reportingTasksGrid.invalidate();
        });
    };

    return {
        /**
         * Initializes the status page.
         */
        init: function () {
            // initialize the settings tabs
            $('#settings-tabs').tabbs({
                tabStyle: 'settings-tab',
                selectedTabStyle: 'settings-selected-tab',
                tabs: [{
                    name: 'General',
                    tabContentId: 'general-settings-tab-content'
                }, {
                    name: 'Controller Services',
                    tabContentId: 'controller-services-tab-content'
                }, {
                    name: 'Reporting Tasks',
                    tabContentId: 'reporting-tasks-tab-content'
                }],
                select: function () {
                    var tab = $(this).text();
                    if (tab === 'General') {
                        $('#new-service-or-task').hide();
                    } else {
                        $('#new-service-or-task').show();

                        // update the tooltip on the button
                        $('#new-service-or-task').attr('title', function () {
                            if (tab === 'Controller Services') {
                                return 'Create a new controller service';
                            } else if (tab === 'Reporting Tasks') {
                                return 'Create a new reporting task';
                            }
                        });

                        // resize the table
                        nf.Settings.resetTableSize();
                    }
                }
            });

            // setup the tooltip for the refresh icon
            $('#settings-refresh-required-icon').qtip($.extend({
                content: 'This flow has been modified by another user. Please refresh.'
            }, nf.CanvasUtils.config.systemTooltipConfig));

            // refresh the system diagnostics when clicked
            nf.Common.addHoverEffect('#settings-refresh-button', 'button-refresh', 'button-refresh-hover').click(function () {
                if ($('#settings-refresh-required-icon').is(':visible')) {
                    nf.CanvasHeader.reloadAndClearWarnings();
                } else {
                    nf.Settings.loadSettings();
                }
            });

            // create a new controller service or reporting task
            $('#new-service-or-task').on('click', function () {
                var selectedTab = $('li.settings-selected-tab').text();
                if (selectedTab === 'Controller Services') {
                    $('#new-controller-service-dialog').modal('show');

                    // reset the canvas size after the dialog is shown
                    var controllerServiceTypesGrid = $('#controller-service-types-table').data('gridInstance');
                    if (nf.Common.isDefinedAndNotNull(controllerServiceTypesGrid)) {
                        controllerServiceTypesGrid.setSelectedRows([0]);
                        controllerServiceTypesGrid.resizeCanvas();
                    }

                    // set the initial focus
                    $('#controller-service-type-filter').focus();
                } else if (selectedTab === 'Reporting Tasks') {
                    $('#new-reporting-task-dialog').modal('show');

                    // reset the canvas size after the dialog is shown
                    var reportingTaskTypesGrid = $('#reporting-task-types-table').data('gridInstance');
                    if (nf.Common.isDefinedAndNotNull(reportingTaskTypesGrid)) {
                        reportingTaskTypesGrid.setSelectedRows([0]);
                        reportingTaskTypesGrid.resizeCanvas();
                    }

                    // set the initial focus
                    $('#reporting-task-type-filter').focus();
                }
            });

            // initialize each tab
            initGeneral();
            initControllerServices();
            initReportingTasks();
        },

        /**
         * Update the size of the grid based on its container's current size.
         */
        resetTableSize: function () {
            var controllerServicesGrid = $('#controller-services-table').data('gridInstance');
            if (nf.Common.isDefinedAndNotNull(controllerServicesGrid)) {
                controllerServicesGrid.resizeCanvas();
            }

            var reportingTasksGrid = $('#reporting-tasks-table').data('gridInstance');
            if (nf.Common.isDefinedAndNotNull(reportingTasksGrid)) {
                reportingTasksGrid.resizeCanvas();
            }
        },

        /**
         * Shows the settings dialog.
         */
        showSettings: function () {
            // show the settings dialog
            nf.Shell.showContent('#settings').done(function () {
                // reset button state
                $('#settings-save').mouseout();
            });

            // adjust the table size
            nf.Settings.resetTableSize();
        },

        /**
         * Loads the settings.
         */
        loadSettings: function (reloadStatus) {
            var settings = $.ajax({
                type: 'GET',
                url: config.urls.controllerConfig,
                dataType: 'json'
            }).done(function (response) {
                // ensure the config is present
                if (nf.Common.isDefinedAndNotNull(response.config)) {
                    // set the header
                    $('#settings-header-text').text(response.config.name + ' Settings');
                    $('#settings-last-refreshed').text(response.config.currentTime);

                    // populate the controller settings
                    if (nf.Common.isDFM()) {
                        $('#data-flow-title-field').val(response.config.name);
                        $('#data-flow-comments-field').val(response.config.comments);
                        $('#maximum-timer-driven-thread-count-field').val(response.config.maxTimerDrivenThreadCount);
                        $('#maximum-event-driven-thread-count-field').val(response.config.maxEventDrivenThreadCount);
                    } else {
                        $('#read-only-data-flow-title-field').html(nf.Common.formatValue(response.config.name));
                        $('#read-only-data-flow-comments-field').html(nf.Common.formatValue(response.config.comments));
                        $('#read-only-maximum-timer-driven-thread-count-field').text(response.config.maxTimerDrivenThreadCount);
                        $('#read-only-maximum-event-driven-thread-count-field').text(response.config.maxEventDrivenThreadCount);
                    }
                }
            });

            // load the controller services
            var controllerServices = loadControllerServices();

            // load the reporting tasks
            var reportingTasks = loadReportingTasks();

            // return a deferred for all parts of the settings
            return $.when(settings, controllerServices, reportingTasks).done(function () {
                // always reload the status, unless the flag is specifically set to false
                if (reloadStatus !== false) {
                    nf.Canvas.reloadStatus();
                }
            }).fail(nf.Common.handleAjaxError);
        },

        /**
         * Sets the controller service and reporting task bulletins in their respective tables.
         *
         * @param {object} controllerServiceBulletins
         * @param {object} reportingTaskBulletins
         */
        setBulletins: function(controllerServiceBulletins, reportingTaskBulletins) {
            // controller services
            var controllerServicesGrid = $('#controller-services-table').data('gridInstance');
            var controllerServicesData = controllerServicesGrid.getData();
            controllerServicesData.beginUpdate();

            // if there are some bulletins process them
            if (!nf.Common.isEmpty(controllerServiceBulletins)) {
                var controllerServiceBulletinsBySource = d3.nest()
                    .key(function(d) { return d.sourceId; })
                    .map(controllerServiceBulletins, d3.map);

                controllerServiceBulletinsBySource.forEach(function(sourceId, sourceBulletins) {
                    var controllerService = controllerServicesData.getItemById(sourceId);
                    if (nf.Common.isDefinedAndNotNull(controllerService)) {
                        controllerServicesData.updateItem(sourceId, $.extend(controllerService, {
                            bulletins: sourceBulletins
                        }));
                    }
                });
            } else {
                // if there are no bulletins clear all
                var controllerServices = controllerServicesData.getItems();
                $.each(controllerServices, function(_, controllerService) {
                    controllerServicesData.updateItem(controllerService.id, $.extend(controllerService, {
                        bulletins: []
                    }));
                });
            }
            controllerServicesData.endUpdate();

            // reporting tasks
            var reportingTasksGrid = $('#reporting-tasks-table').data('gridInstance');
            var reportingTasksData = reportingTasksGrid.getData();
            reportingTasksData.beginUpdate();

            // if there are some bulletins process them
            if (!nf.Common.isEmpty(reportingTaskBulletins)) {
                var reportingTaskBulletinsBySource = d3.nest()
                    .key(function(d) { return d.sourceId; })
                    .map(reportingTaskBulletins, d3.map);

                reportingTaskBulletinsBySource.forEach(function(sourceId, sourceBulletins) {
                    var reportingTask = reportingTasksData.getItemById(sourceId);
                    if (nf.Common.isDefinedAndNotNull(reportingTask)) {
                        reportingTasksData.updateItem(sourceId, $.extend(reportingTask, {
                            bulletins: sourceBulletins
                        }));
                    }
                });
            } else {
                // if there are no bulletins clear all
                var reportingTasks = reportingTasksData.getItems();
                $.each(reportingTasks, function(_, reportingTask) {
                    reportingTasksData.updateItem(reportingTask.id, $.extend(reportingTask, {
                        bulletins: []
                    }));
                });
            }
            reportingTasksData.endUpdate();
        }
    };
}());