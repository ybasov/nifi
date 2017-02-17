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
package org.apache.nifi.schemaregistry.processors;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.apache.avro.Schema;
import org.apache.nifi.annotation.lifecycle.OnScheduled;
import org.apache.nifi.components.PropertyDescriptor;
import org.apache.nifi.flowfile.FlowFile;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.schemaregistry.services.SchemaRegistry;

/**
 * Base processor for implementing transform-like processors that integrate with
 * Schema Registry (see {@link SchemaRegistry})
 */
abstract class AbstractTransformer extends BaseTransformer implements RegistryCommon {

    static final List<PropertyDescriptor> BASE_DESCRIPTORS;

    static {
        List<PropertyDescriptor> descriptors = new ArrayList<PropertyDescriptor>();
        descriptors.add(REGISTRY_SERVICE);
        descriptors.add(SCHEMA_NAME);
        BASE_DESCRIPTORS = Collections.unmodifiableList(descriptors);
    }

    volatile SchemaRegistry schemaRegistryDelegate;

    /**
     *
     */
    @Override
    @OnScheduled
    public void onScheduled(ProcessContext context) {
        this.schemaRegistryDelegate = context.getProperty(REGISTRY_SERVICE).asControllerService(SchemaRegistry.class);
    }

    /**
     * This operation is designed to allow sub-classes to provide
     * implementations that read content of the provided {@link InputStream}
     * that represent the content of the incoming {@link FlowFile}.
     * <p>
     * The returned {@link Map} represents attributes that will be added to the
     * outgoing FlowFile.
     *
     *
     * @param in
     *            {@link InputStream} representing data to be transformer
     * @param contextProperties
     *            instance of {@link InvocationContextProperties}
     * @param schema
     *            instance of avro {@link Schema}
     */
    protected abstract Map<String, String> transform(InputStream in, InvocationContextProperties contextProperties, Schema schema);

    /**
     *
     */
    @Override
    protected List<PropertyDescriptor> getSupportedPropertyDescriptors() {
        return BASE_DESCRIPTORS;
    }

    /**
     *
     */
    @Override
    protected Map<String, String> transform(InputStream in, OutputStream out, InvocationContextProperties contextProperties) {
        Schema schema = RegistryCommon.retrieveSchema(this.schemaRegistryDelegate, contextProperties);
        return this.transform(in, contextProperties, schema);
    }
}
