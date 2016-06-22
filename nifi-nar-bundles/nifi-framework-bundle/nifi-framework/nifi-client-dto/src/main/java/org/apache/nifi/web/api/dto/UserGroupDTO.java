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
package org.apache.nifi.web.api.dto;

import com.wordnik.swagger.annotations.ApiModelProperty;
import org.apache.nifi.web.api.entity.UserEntity;

import javax.xml.bind.annotation.XmlType;
import java.util.Set;

/**
 * A user group in this NiFi.
 */
@XmlType(name = "userGroup")
public class UserGroupDTO extends ComponentDTO {

    private String name;
    private Set<UserEntity> users;

    /**
     * @return users in this group
     */
    @ApiModelProperty(
            value = "The users that belong to the user group."
    )
    public Set<UserEntity> getUsers() {
        return users;
    }

    public void setUsers(Set<UserEntity> users) {
        this.users = users;
    }

    /**
     *
     * @return name of the user group
     */
    @ApiModelProperty(value = "The name of the user group.")
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }
}
