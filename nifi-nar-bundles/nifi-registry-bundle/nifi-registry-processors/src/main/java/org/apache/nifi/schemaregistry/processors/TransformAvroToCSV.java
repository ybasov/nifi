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

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;
import java.util.Map;

import org.apache.avro.Schema;
import org.apache.avro.generic.GenericRecord;
import org.apache.commons.io.IOUtils;
import org.apache.nifi.annotation.behavior.InputRequirement;
import org.apache.nifi.annotation.documentation.CapabilityDescription;
import org.apache.nifi.annotation.documentation.Tags;
import org.apache.nifi.flowfile.attributes.CoreAttributes;

@Tags({ "registry", "schema", "avro", "csv", "transform" })
@CapabilityDescription("Transforms AVRO content of the Flow File to CSV using the schema provided by the Schema Registry Service.")
@InputRequirement(InputRequirement.Requirement.INPUT_REQUIRED)
public final class TransformAvroToCSV extends AbstractCSVTransformer {

    /**
     *
     */
    @Override
    protected Map<String, String> transform(InputStream in, OutputStream out, InvocationContextProperties contextProperties, Schema schema) {
        byte[] buff = null;
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            IOUtils.copy(in, bos);
            buff = bos.toByteArray();
        } catch (Exception e) {
            e.printStackTrace();
        }
        ByteArrayInputStream is = new ByteArrayInputStream(buff);
        GenericRecord avroRecord = AvroUtils.read(is, schema);
        CSVUtils.write(avroRecord, this.delimiter, out);
        return Collections.singletonMap(CoreAttributes.MIME_TYPE.key(), "text/csv");
    }
}
