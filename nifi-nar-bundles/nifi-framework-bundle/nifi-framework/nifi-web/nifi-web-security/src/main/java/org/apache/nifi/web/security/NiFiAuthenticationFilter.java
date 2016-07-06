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
package org.apache.nifi.web.security;

import java.io.IOException;
import java.io.PrintWriter;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.apache.commons.lang3.StringUtils;
import org.apache.nifi.user.NiFiUser;
import org.apache.nifi.util.NiFiProperties;
import org.apache.nifi.web.security.token.NiFiAuthorizationRequestToken;
import org.apache.nifi.web.security.user.NiFiUserUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.AccountStatusException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.filter.GenericFilterBean;

/**
 *
 */
public abstract class NiFiAuthenticationFilter extends GenericFilterBean {

    private static final Logger log = LoggerFactory.getLogger(NiFiAuthenticationFilter.class);

    private AuthenticationManager authenticationManager;
    private NiFiProperties properties;

    @Override
    public void doFilter(final ServletRequest request, final ServletResponse response, final FilterChain chain) throws IOException, ServletException {
        final Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (log.isDebugEnabled()) {
            log.debug("Checking secure context token: " + authentication);
        }

        if (requiresAuthentication((HttpServletRequest) request)) {
            authenticate((HttpServletRequest) request, (HttpServletResponse) response, chain);
        } else {
            chain.doFilter(request, response);
        }

    }

    private boolean requiresAuthentication(final HttpServletRequest request) {
        // continue attempting authorization if the user is anonymous
        if (isAnonymousUser()) {
            return true;
        }

        // or there is no user yet
        return NiFiUserUtils.getNiFiUser() == null && NiFiUserUtils.getNewAccountRequest() == null;
    }

    private boolean isAnonymousUser() {
        final NiFiUser user = NiFiUserUtils.getNiFiUser();
        return user != null && NiFiUser.ANONYMOUS_USER_IDENTITY.equals(user.getIdentity());
    }

    private void authenticate(final HttpServletRequest request, final HttpServletResponse response, final FilterChain chain) throws IOException, ServletException {
        String dnChain = null;
        try {
            final NiFiAuthorizationRequestToken authenticated = attemptAuthentication(request);
            if (authenticated != null) {
                dnChain = ProxiedEntitiesUtils.formatProxyDn(StringUtils.join(authenticated.getChain(), "><"));

                // log the request attempt - response details will be logged later
                log.info(String.format("Attempting request for (%s) %s %s (source ip: %s)", dnChain, request.getMethod(),
                        request.getRequestURL().toString(), request.getRemoteAddr()));

                // attempt to authorize the user
                final Authentication authorized = authenticationManager.authenticate(authenticated);
                successfulAuthorization(request, response, authorized);
            }

            // continue
            chain.doFilter(request, response);
        } catch (final InvalidAuthenticationException iae) {
            // invalid authentication - always error out
            unsuccessfulAuthorization(request, response, iae);
        } catch (final AuthenticationException ae) {
            // other authentication exceptions... if we are already the anonymous user, allow through otherwise error out
            if (isAnonymousUser()) {
                if (dnChain == null) {
                    log.info(String.format("Continuing as anonymous user. Unable to authenticate %s: %s", dnChain, ae));
                } else {
                    log.info(String.format("Continuing as anonymous user. Unable to authenticate: %s", ae));
                }

                chain.doFilter(request, response);
            } else {
                unsuccessfulAuthorization(request, response, ae);
            }
        }
    }

    /**
     * Attempt to authenticate the client making the request. If the request does not contain an authentication attempt, this method should return null. If the request contains an authentication
     * request, the implementation should convert it to a NiFiAuthorizationRequestToken (which is used when authorizing the client). Implementations should throw InvalidAuthenticationException when
     * the request contains an authentication request but it could not be authenticated.
     *
     * @param request The request
     * @return The NiFiAuthorizationRequestToken used to later authorized the client
     * @throws InvalidAuthenticationException If the request contained an authentication attempt, but could not authenticate
     */
    public abstract NiFiAuthorizationRequestToken attemptAuthentication(HttpServletRequest request);

    protected void successfulAuthorization(HttpServletRequest request, HttpServletResponse response, Authentication authResult) {
        if (log.isDebugEnabled()) {
            log.debug("Authentication success: " + authResult);
        }

        SecurityContextHolder.getContext().setAuthentication(authResult);
        ProxiedEntitiesUtils.successfulAuthorization(request, response, authResult);
    }

    protected void unsuccessfulAuthorization(HttpServletRequest request, HttpServletResponse response, AuthenticationException ae) throws IOException {
        // populate the response
        ProxiedEntitiesUtils.unsuccessfulAuthorization(request, response, ae);

        // set the response status
        response.setContentType("text/plain");

        // write the response message
        PrintWriter out = response.getWriter();

        // use the type of authentication exception to determine the response code
        if (ae instanceof UsernameNotFoundException) {
            if (properties.getSupportNewAccountRequests()) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                out.println("Not authorized.");
            } else {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                out.println("Access is denied.");
            }
        } else if (ae instanceof InvalidAuthenticationException) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            out.println(ae.getMessage());
        } else if (ae instanceof AccountStatusException) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            out.println(ae.getMessage());
        } else if (ae instanceof UntrustedProxyException) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            out.println(ae.getMessage());
        } else if (ae instanceof AuthenticationServiceException) {
            log.error(String.format("Unable to authorize: %s", ae.getMessage()), ae);
            response.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            out.println(String.format("Unable to authorize: %s", ae.getMessage()));
        } else {
            log.error(String.format("Unable to authorize: %s", ae.getMessage()), ae);
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            out.println("Access is denied.");
        }

        // log the failure
        log.info(String.format("Rejecting access to web api: %s", ae.getMessage()));

        // optionally log the stack trace
        if (log.isDebugEnabled()) {
            log.debug(StringUtils.EMPTY, ae);
        }
    }

    /**
     * Determines if the specified request is attempting to register a new user account.
     *
     * @param request http request
     * @return true if new user
     */
    protected final boolean isNewAccountRequest(HttpServletRequest request) {
        if ("POST".equalsIgnoreCase(request.getMethod())) {
            String path = request.getPathInfo();
            if (StringUtils.isNotBlank(path)) {
                if ("/controller/users".equals(path)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Extracts the justification from the specified request.
     *
     * @param request The request
     * @return The justification
     */
    protected final String getJustification(HttpServletRequest request) {
        // get the justification
        String justification = request.getParameter("justification");
        if (justification == null) {
            justification = StringUtils.EMPTY;
        }
        return justification;
    }

    @Override
    public void destroy() {
    }

    public void setAuthenticationManager(AuthenticationManager authenticationManager) {
        this.authenticationManager = authenticationManager;
    }

    public void setProperties(NiFiProperties properties) {
        this.properties = properties;
    }

}
