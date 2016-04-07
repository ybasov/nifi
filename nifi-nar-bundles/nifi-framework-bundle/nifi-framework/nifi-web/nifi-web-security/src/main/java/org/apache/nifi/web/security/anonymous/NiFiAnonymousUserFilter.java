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
package org.apache.nifi.web.security.anonymous;

import java.util.EnumSet;
import javax.servlet.http.HttpServletRequest;
import org.apache.commons.lang3.StringUtils;
import org.apache.nifi.admin.service.AdministrationException;
import org.apache.nifi.admin.service.UserService;
import org.apache.nifi.authorization.Authority;
import org.apache.nifi.user.NiFiUser;
import org.apache.nifi.web.security.user.NiFiUserDetails;
import org.apache.nifi.web.security.token.NiFiAuthorizationToken;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;

/**
 * Custom AnonymouseAuthenticationFilter used to grant additional authorities depending on the current operating mode.
 */
public class NiFiAnonymousUserFilter extends AnonymousAuthenticationFilter {

    private static final Logger anonymousUserFilterLogger = LoggerFactory.getLogger(NiFiAnonymousUserFilter.class);

    private static final String ANONYMOUS_KEY = "anonymousNifiKey";

    private UserService userService;

    public NiFiAnonymousUserFilter() {
        super(ANONYMOUS_KEY);
    }

    @Override
    protected Authentication createAuthentication(HttpServletRequest request) {
        Authentication authentication = null;

        try {
            // load the anonymous user from the database
            NiFiUser user = userService.getUserByDn(NiFiUser.ANONYMOUS_USER_IDENTITY);

            // if this is an unsecure request allow full access
            if (!request.isSecure()) {
                user.getAuthorities().addAll(EnumSet.allOf(Authority.class));
            }

            // only create an authentication token if the anonymous user has some authorities or they are accessing a ui
            // extension. ui extensions have run this security filter but we shouldn't require authentication/authorization
            // when accessing static resources like images, js, and css. authentication/authorization is required when
            // interacting with nifi however and that will be verified in the NiFiWebContext or NiFiWebConfigurationContext
            if (!user.getAuthorities().isEmpty() || !request.getContextPath().startsWith("/nifi-api")) {
                NiFiUserDetails userDetails = new NiFiUserDetails(user);

                // get the granted authorities
                authentication = new NiFiAuthorizationToken(userDetails);
            }
        } catch (AdministrationException ase) {
            // record the issue
            anonymousUserFilterLogger.warn("Unable to load anonymous user from accounts database: " + ase.getMessage());
            if (anonymousUserFilterLogger.isDebugEnabled()) {
                anonymousUserFilterLogger.warn(StringUtils.EMPTY, ase);
            }
        }
        return authentication;
    }

    /* setters */
    public void setUserService(UserService userService) {
        this.userService = userService;
    }

}
