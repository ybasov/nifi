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

package org.apache.nifi.serialization;

import java.io.IOException;
import java.io.OutputStream;

import org.apache.nifi.serialization.record.Record;

public interface RecordWriter {
    /**
     * Writes the given result set to the given output stream
     *
     * @param recordSet the record set to serialize
     * @param out the OutputStream to write to
     * @return the results of writing the data
     * @throws IOException if unable to write to the given OutputStream
     */
    WriteResult write(Record record, OutputStream out) throws IOException;

    /**
     * @return the MIME Type that the Result Set Writer produces. This will be added to FlowFiles using
     *         the mime.type attribute.
     */
    String getMimeType();
}
