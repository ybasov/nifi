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
package org.apache.nifi.processors.standard.util.crypto;

import org.apache.nifi.processor.exception.ProcessException;
import org.apache.nifi.security.util.KeyDerivationFunction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.HashMap;
import java.util.Map;

public class CipherProviderFactory {
    private static final Logger logger = LoggerFactory.getLogger(CipherProviderFactory.class);

    private static final Map<KeyDerivationFunction, Class<? extends CipherProvider>> REGISTERED_CIPHER_PROVIDERS = new HashMap<>();

    static {
        REGISTERED_CIPHER_PROVIDERS.put(KeyDerivationFunction.NIFI_LEGACY, NiFiLegacyCipherProvider.class);
        REGISTERED_CIPHER_PROVIDERS.put(KeyDerivationFunction.OPENSSL_EVP_BYTES_TO_KEY, OpenSSLPKCS5CipherProvider.class);
        REGISTERED_CIPHER_PROVIDERS.put(KeyDerivationFunction.PBKDF2, PBKDF2CipherProvider.class);
        REGISTERED_CIPHER_PROVIDERS.put(KeyDerivationFunction.BCRYPT, BcryptCipherProvider.class);
        REGISTERED_CIPHER_PROVIDERS.put(KeyDerivationFunction.SCRYPT, ScryptCipherProvider.class);
        REGISTERED_CIPHER_PROVIDERS.put(KeyDerivationFunction.NONE, AESKeyedCipherProvider.class);
    }

    public static CipherProvider getCipherProvider(KeyDerivationFunction kdf) {
        logger.debug("{} KDFs registered", REGISTERED_CIPHER_PROVIDERS.size());

        if (REGISTERED_CIPHER_PROVIDERS.containsKey(kdf)) {
            Class<? extends CipherProvider> clazz = REGISTERED_CIPHER_PROVIDERS.get(kdf);
            try {
                return clazz.newInstance();
            } catch (Exception e) {
               logger.error("Error instantiating new {} with default parameters for {}", clazz.getName(), kdf.getName());
                throw new ProcessException("Error instantiating cipher provider");
            }
        }

        throw new IllegalArgumentException("No cipher provider registered for " + kdf.getName());
    }
}
