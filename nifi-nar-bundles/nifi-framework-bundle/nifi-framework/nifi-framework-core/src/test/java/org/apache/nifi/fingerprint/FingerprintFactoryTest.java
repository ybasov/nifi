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
package org.apache.nifi.fingerprint;

import static org.apache.nifi.fingerprint.FingerprintFactory.FLOW_CONFIG_XSD;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.Matchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.lang.reflect.Method;

import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.nifi.connectable.Position;
import org.apache.nifi.controller.serialization.FlowSerializer;
import org.apache.nifi.controller.serialization.StandardFlowSerializer;
import org.apache.nifi.encrypt.StringEncryptor;
import org.apache.nifi.groups.RemoteProcessGroup;
import org.apache.nifi.remote.protocol.SiteToSiteTransportProtocol;
import org.apache.nifi.util.NiFiProperties;
import org.junit.Before;
import org.junit.Test;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;

import org.w3c.dom.Document;
import org.w3c.dom.Element;

/**
 */
public class FingerprintFactoryTest {

    private NiFiProperties nifiProperties;
    private StringEncryptor encryptor;
    private FingerprintFactory fingerprinter;

    @Before
    public void setup() {
        nifiProperties = getNiFiProperties();
        encryptor = StringEncryptor.createEncryptor(nifiProperties);
        fingerprinter = new FingerprintFactory(encryptor);
    }

    @Test
    public void testSameFingerprint() throws IOException {
        final String fp1 = fingerprinter.createFingerprint(getResourceBytes("/nifi/fingerprint/flow1a.xml"), null);
        final String fp2 = fingerprinter.createFingerprint(getResourceBytes("/nifi/fingerprint/flow1b.xml"), null);
        assertEquals(fp1, fp2);
    }

    @Test
    public void testDifferentFingerprint() throws IOException {
        final String fp1 = fingerprinter.createFingerprint(getResourceBytes("/nifi/fingerprint/flow1a.xml"), null);
        final String fp2 = fingerprinter.createFingerprint(getResourceBytes("/nifi/fingerprint/flow2.xml"), null);
        assertNotEquals(fp1, fp2);
    }

    @Test
    public void testResourceValueInFingerprint() throws IOException {
        final String fingerprint = fingerprinter.createFingerprint(getResourceBytes("/nifi/fingerprint/flow1a.xml"), null);
        assertEquals(3, StringUtils.countMatches(fingerprint, "success"));
        assertTrue(fingerprint.contains("In Connection"));
    }

    @Test
    public void testSchemaValidation() throws IOException {
        FingerprintFactory fp = new FingerprintFactory(null, getValidatingDocumentBuilder());
        final String fingerprint = fp.createFingerprint(getResourceBytes("/nifi/fingerprint/validating-flow.xml"), null);
    }

    private byte[] getResourceBytes(final String resource) throws IOException {
        return IOUtils.toByteArray(FingerprintFactoryTest.class.getResourceAsStream(resource));
    }

    private DocumentBuilder getValidatingDocumentBuilder() {
        final DocumentBuilderFactory documentBuilderFactory = DocumentBuilderFactory.newInstance();
        documentBuilderFactory.setNamespaceAware(true);
        final SchemaFactory schemaFactory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
        final Schema schema;
        try {
            schema = schemaFactory.newSchema(FingerprintFactory.class.getResource(FLOW_CONFIG_XSD));
        } catch (final Exception e) {
            throw new RuntimeException("Failed to parse schema for file flow configuration.", e);
        }
        try {
            documentBuilderFactory.setSchema(schema);
            DocumentBuilder docBuilder = documentBuilderFactory.newDocumentBuilder();
            docBuilder.setErrorHandler(new ErrorHandler() {
                @Override
                public void warning(SAXParseException e) throws SAXException {
                    throw e;
                }

                @Override
                public void error(SAXParseException e) throws SAXException {
                    throw e;
                }

                @Override
                public void fatalError(SAXParseException e) throws SAXException {
                    throw e;
                }
            });
            return docBuilder;
        } catch (final Exception e) {
            throw new RuntimeException("Failed to create document builder for flow configuration.", e);
        }
    }

    private <T> Element serializeElement(final StringEncryptor encryptor, final Class<T> componentClass, final T component,
                                         final String serializerMethodName) throws Exception {

        final DocumentBuilderFactory docFactory = DocumentBuilderFactory.newInstance();
        final DocumentBuilder docBuilder = docFactory.newDocumentBuilder();
        final Document doc = docBuilder.newDocument();

        final FlowSerializer flowSerializer = new StandardFlowSerializer(encryptor);
        final Method serializeMethod = StandardFlowSerializer.class.getDeclaredMethod(serializerMethodName,
                Element.class, componentClass);
        serializeMethod.setAccessible(true);
        final Element rootElement = doc.createElement("root");
        serializeMethod.invoke(flowSerializer, rootElement, component);
        return rootElement;
    }

    private NiFiProperties getNiFiProperties() {
        final NiFiProperties nifiProperties = mock(NiFiProperties.class);
        when(nifiProperties.getProperty(StringEncryptor.NF_SENSITIVE_PROPS_ALGORITHM)).thenReturn("PBEWITHMD5AND256BITAES-CBC-OPENSSL");
        when(nifiProperties.getProperty(StringEncryptor.NF_SENSITIVE_PROPS_PROVIDER)).thenReturn("BC");
        when(nifiProperties.getProperty(anyString(), anyString())).then(invocation -> invocation.getArgumentAt(1, String.class));
        return nifiProperties;
    }

    private <T> String fingerprint(final String methodName, final Class<T> inputClass, final T input) throws Exception {
        final Method fingerprintFromComponent = FingerprintFactory.class.getDeclaredMethod(methodName,
                StringBuilder.class, inputClass);
        fingerprintFromComponent.setAccessible(true);

        final StringBuilder fingerprint = new StringBuilder();
        fingerprintFromComponent.invoke(fingerprinter, fingerprint, input);
        return fingerprint.toString();
    }

    @Test
    public void testRemoteProcessGroupFingerprintRaw() throws Exception {

        // Fill out every configuration.
        final RemoteProcessGroup component = mock(RemoteProcessGroup.class);
        when(component.getName()).thenReturn("name");
        when(component.getIdentifier()).thenReturn("id");
        when(component.getPosition()).thenReturn(new Position(10.5, 20.3));
        when(component.getTargetUri()).thenReturn("http://node1:8080/nifi");
        when(component.getTargetUris()).thenReturn("http://node1:8080/nifi, http://node2:8080/nifi");
        when(component.getNetworkInterface()).thenReturn("eth0");
        when(component.getComments()).thenReturn("comment");
        when(component.getCommunicationsTimeout()).thenReturn("10 sec");
        when(component.getYieldDuration()).thenReturn("30 sec");
        when(component.getTransportProtocol()).thenReturn(SiteToSiteTransportProtocol.RAW);
        when(component.getProxyHost()).thenReturn(null);
        when(component.getProxyPort()).thenReturn(null);
        when(component.getProxyUser()).thenReturn(null);
        when(component.getProxyPassword()).thenReturn(null);

        // Assert fingerprints with expected one.
        final String expected = "id" +
                "http://node1:8080/nifi, http://node2:8080/nifi" +
                "eth0" +
                "10 sec" +
                "30 sec" +
                "RAW" +
                "NO_VALUE" +
                "NO_VALUE" +
                "NO_VALUE" +
                "NO_VALUE";

        final Element rootElement = serializeElement(encryptor, RemoteProcessGroup.class, component, "addRemoteProcessGroup");
        final Element componentElement = (Element) rootElement.getElementsByTagName("remoteProcessGroup").item(0);
        assertEquals(expected, fingerprint("addRemoteProcessGroupFingerprint", Element.class, componentElement));

    }

    @Test
    public void testRemoteProcessGroupFingerprintWithProxy() throws Exception {

        // Fill out every configuration.
        final RemoteProcessGroup component = mock(RemoteProcessGroup.class);
        when(component.getName()).thenReturn("name");
        when(component.getIdentifier()).thenReturn("id");
        when(component.getPosition()).thenReturn(new Position(10.5, 20.3));
        when(component.getTargetUri()).thenReturn("http://node1:8080/nifi");
        when(component.getTargetUris()).thenReturn("http://node1:8080/nifi, http://node2:8080/nifi");
        when(component.getComments()).thenReturn("comment");
        when(component.getCommunicationsTimeout()).thenReturn("10 sec");
        when(component.getYieldDuration()).thenReturn("30 sec");
        when(component.getTransportProtocol()).thenReturn(SiteToSiteTransportProtocol.HTTP);
        when(component.getProxyHost()).thenReturn("proxy-host");
        when(component.getProxyPort()).thenReturn(3128);
        when(component.getProxyUser()).thenReturn("proxy-user");
        when(component.getProxyPassword()).thenReturn("proxy-pass");

        // Assert fingerprints with expected one.
        final String expected = "id" +
                "http://node1:8080/nifi, http://node2:8080/nifi" +
                "NO_VALUE" +
                "10 sec" +
                "30 sec" +
                "HTTP" +
                "proxy-host" +
                "3128" +
                "proxy-user" +
                "proxy-pass";

        final Element rootElement = serializeElement(encryptor, RemoteProcessGroup.class, component, "addRemoteProcessGroup");
        final Element componentElement = (Element) rootElement.getElementsByTagName("remoteProcessGroup").item(0);
        assertEquals(expected.toString(), fingerprint("addRemoteProcessGroupFingerprint", Element.class, componentElement));
    }

}
