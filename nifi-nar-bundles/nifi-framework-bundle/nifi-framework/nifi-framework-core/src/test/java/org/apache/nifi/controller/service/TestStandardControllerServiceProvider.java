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
package org.apache.nifi.controller.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.beans.PropertyDescriptor;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.apache.nifi.components.state.StateManager;
import org.apache.nifi.components.state.StateManagerProvider;
import org.apache.nifi.controller.Heartbeater;
import org.apache.nifi.controller.ProcessScheduler;
import org.apache.nifi.controller.ProcessorNode;
import org.apache.nifi.controller.ScheduledState;
import org.apache.nifi.controller.StandardProcessorNode;
import org.apache.nifi.controller.scheduling.StandardProcessScheduler;
import org.apache.nifi.controller.service.mock.DummyProcessor;
import org.apache.nifi.controller.service.mock.ServiceA;
import org.apache.nifi.controller.service.mock.ServiceB;
import org.apache.nifi.groups.ProcessGroup;
import org.apache.nifi.groups.StandardProcessGroup;
import org.apache.nifi.processor.StandardValidationContextFactory;
import org.apache.nifi.registry.VariableRegistry;
import org.apache.nifi.registry.VariableRegistryUtils;
import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;
import org.mockito.Mockito;

public class TestStandardControllerServiceProvider {
    private static StateManagerProvider stateManagerProvider = new StateManagerProvider() {
        @Override
        public StateManager getStateManager(String componentId) {
            return Mockito.mock(StateManager.class);
        }

        @Override
        public void shutdown() {
        }

        @Override
        public void enableClusterProvider() {
        }

        @Override
        public void disableClusterProvider() {
        }

        @Override
        public void onComponentRemoved(String componentId) {
        }
    };

    private static VariableRegistry variableRegistry = VariableRegistryUtils.createVariableRegistry();

    @BeforeClass
    public static void setNiFiProps() {
        System.setProperty("nifi.properties.file.path", "src/test/resources/nifi.properties");
    }

    private StandardProcessScheduler createScheduler() {
        final Heartbeater heartbeater = Mockito.mock(Heartbeater.class);
        return new StandardProcessScheduler(heartbeater, null, null, stateManagerProvider, variableRegistry);
    }

    @Test
    public void testDisableControllerService() {
        final ProcessScheduler scheduler = createScheduler();
        final StandardControllerServiceProvider provider = new StandardControllerServiceProvider(scheduler, null, stateManagerProvider, variableRegistry);

        final ControllerServiceNode serviceNode = provider.createControllerService(ServiceB.class.getName(), "B", false);
        provider.enableControllerService(serviceNode);
        provider.disableControllerService(serviceNode);
    }

    @Test(timeout=10000)
    public void testEnableDisableWithReference() {
        final ProcessScheduler scheduler = createScheduler();
        final StandardControllerServiceProvider provider = new StandardControllerServiceProvider(scheduler, null, stateManagerProvider, variableRegistry);

        final ControllerServiceNode serviceNodeB = provider.createControllerService(ServiceB.class.getName(), "B", false);
        final ControllerServiceNode serviceNodeA = provider.createControllerService(ServiceA.class.getName(), "A", false);

        serviceNodeA.setProperty(ServiceA.OTHER_SERVICE.getName(), "B");

        try {
            provider.enableControllerService(serviceNodeA);
            Assert.fail("Was able to enable Service A but Service B is disabled.");
        } catch (final IllegalStateException expected) {
        }

        provider.enableControllerService(serviceNodeB);
        provider.enableControllerService(serviceNodeA);

        try {
            provider.disableControllerService(serviceNodeB);
            Assert.fail("Was able to disable Service B but Service A is enabled and references B");
        } catch (final IllegalStateException expected) {
        }

        provider.disableControllerService(serviceNodeA);
        waitForServiceState(serviceNodeA, ControllerServiceState.DISABLED);

        provider.disableControllerService(serviceNodeB);
        waitForServiceState(serviceNodeB, ControllerServiceState.DISABLED);
    }

    private void waitForServiceState(final ControllerServiceNode service, final ControllerServiceState desiredState) {
        while (service.getState() != desiredState) {
            try {
                Thread.sleep(50L);
            } catch (final InterruptedException e) {
            }
        }
    }

    /**
     * We run the same test 1000 times and prior to bug fix (see NIFI-1143) it
     * would fail on some iteration. For more details please see
     * {@link PropertyDescriptor}.isDependentServiceEnableable() as well as
     * https://issues.apache.org/jira/browse/NIFI-1143
     */
    @Test(timeout = 60000)
    public void testConcurrencyWithEnablingReferencingServicesGraph() {
        final ProcessScheduler scheduler = createScheduler();
        for (int i = 0; i < 10000; i++) {
            testEnableReferencingServicesGraph(scheduler);
        }
    }

    public void testEnableReferencingServicesGraph(ProcessScheduler scheduler) {
        final StandardControllerServiceProvider provider = new StandardControllerServiceProvider(scheduler, null, stateManagerProvider, variableRegistry);

        // build a graph of controller services with dependencies as such:
        //
        // A -> B -> D
        // C ---^----^
        //
        // In other words, A references B, which references D.
        // AND
        // C references B and D.
        //
        // So we have to verify that if D is enabled, when we enable its referencing services,
        // we enable C and B, even if we attempt to enable C before B... i.e., if we try to enable C, we cannot do so
        // until B is first enabled so ensure that we enable B first.
        final ControllerServiceNode serviceNode1 = provider.createControllerService(ServiceA.class.getName(), "1", false);
        final ControllerServiceNode serviceNode2 = provider.createControllerService(ServiceA.class.getName(), "2", false);
        final ControllerServiceNode serviceNode3 = provider.createControllerService(ServiceA.class.getName(), "3", false);
        final ControllerServiceNode serviceNode4 = provider.createControllerService(ServiceB.class.getName(), "4", false);

        serviceNode1.setProperty(ServiceA.OTHER_SERVICE.getName(), "2");
        serviceNode2.setProperty(ServiceA.OTHER_SERVICE.getName(), "4");
        serviceNode3.setProperty(ServiceA.OTHER_SERVICE.getName(), "2");
        serviceNode3.setProperty(ServiceA.OTHER_SERVICE_2.getName(), "4");

        provider.enableControllerService(serviceNode4);
        provider.enableReferencingServices(serviceNode4);

        // Verify that the services are either ENABLING or ENABLED, and wait for all of them to become ENABLED.
        // Note that we set a timeout of 10 seconds, in case a bug occurs and the services never become ENABLED.
        final Set<ControllerServiceState> validStates = new HashSet<>();
        validStates.add(ControllerServiceState.ENABLED);
        validStates.add(ControllerServiceState.ENABLING);

        while (serviceNode3.getState() != ControllerServiceState.ENABLED || serviceNode2.getState() != ControllerServiceState.ENABLED || serviceNode1.getState() != ControllerServiceState.ENABLED) {
            assertTrue(validStates.contains(serviceNode3.getState()));
            assertTrue(validStates.contains(serviceNode2.getState()));
            assertTrue(validStates.contains(serviceNode1.getState()));
        }
    }


    @Test
    public void testOrderingOfServices() {
        final StandardControllerServiceProvider provider = new StandardControllerServiceProvider(null, null, stateManagerProvider, variableRegistry);
        final ControllerServiceNode serviceNode1 = provider.createControllerService(ServiceA.class.getName(), "1", false);
        final ControllerServiceNode serviceNode2 = provider.createControllerService(ServiceB.class.getName(), "2", false);

        serviceNode1.setProperty(ServiceA.OTHER_SERVICE.getName(), "2");

        final Map<String, ControllerServiceNode> nodeMap = new LinkedHashMap<>();
        nodeMap.put("1", serviceNode1);
        nodeMap.put("2", serviceNode2);

        List<List<ControllerServiceNode>> branches = StandardControllerServiceProvider.determineEnablingOrder(nodeMap);
        assertEquals(2, branches.size());
        List<ControllerServiceNode> ordered = branches.get(0);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode2);
        assertTrue(ordered.get(1) == serviceNode1);
        assertEquals(1, branches.get(1).size());
        assertTrue(branches.get(1).get(0) == serviceNode2);

        nodeMap.clear();
        nodeMap.put("2", serviceNode2);
        nodeMap.put("1", serviceNode1);

        branches = StandardControllerServiceProvider.determineEnablingOrder(nodeMap);
        assertEquals(2, branches.size());
        ordered = branches.get(1);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode2);
        assertTrue(ordered.get(1) == serviceNode1);
        assertEquals(1, branches.get(0).size());
        assertTrue(branches.get(0).get(0) == serviceNode2);

        // add circular dependency on self.
        nodeMap.clear();
        serviceNode1.setProperty(ServiceA.OTHER_SERVICE_2.getName(), "1");
        nodeMap.put("1", serviceNode1);
        nodeMap.put("2", serviceNode2);

        branches = StandardControllerServiceProvider.determineEnablingOrder(nodeMap);
        assertEquals(2, branches.size());
        ordered = branches.get(0);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode2);
        assertTrue(ordered.get(1) == serviceNode1);

        nodeMap.clear();
        nodeMap.put("2", serviceNode2);
        nodeMap.put("1", serviceNode1);
        branches = StandardControllerServiceProvider.determineEnablingOrder(nodeMap);
        assertEquals(2, branches.size());
        ordered = branches.get(1);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode2);
        assertTrue(ordered.get(1) == serviceNode1);

        // add circular dependency once removed. In this case, we won't actually be able to enable these because of the
        // circular dependency because they will never be valid because they will always depend on a disabled service.
        // But we want to ensure that the method returns successfully without throwing a StackOverflowException or anything
        // like that.
        nodeMap.clear();
        final ControllerServiceNode serviceNode3 = provider.createControllerService(ServiceA.class.getName(), "3", false);
        serviceNode1.setProperty(ServiceA.OTHER_SERVICE.getName(), "3");
        serviceNode3.setProperty(ServiceA.OTHER_SERVICE.getName(), "1");
        nodeMap.put("1", serviceNode1);
        nodeMap.put("3", serviceNode3);
        branches = StandardControllerServiceProvider.determineEnablingOrder(nodeMap);
        assertEquals(2, branches.size());
        ordered = branches.get(0);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode3);
        assertTrue(ordered.get(1) == serviceNode1);

        nodeMap.clear();
        nodeMap.put("3", serviceNode3);
        nodeMap.put("1", serviceNode1);
        branches = StandardControllerServiceProvider.determineEnablingOrder(nodeMap);
        assertEquals(2, branches.size());
        ordered = branches.get(1);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode3);
        assertTrue(ordered.get(1) == serviceNode1);

        // Add multiple completely disparate branches.
        nodeMap.clear();
        serviceNode1.setProperty(ServiceA.OTHER_SERVICE.getName(), "2");
        final ControllerServiceNode serviceNode4 = provider.createControllerService(ServiceB.class.getName(), "4", false);
        final ControllerServiceNode serviceNode5 = provider.createControllerService(ServiceB.class.getName(), "5", false);
        serviceNode3.setProperty(ServiceA.OTHER_SERVICE.getName(), "4");
        nodeMap.put("1", serviceNode1);
        nodeMap.put("2", serviceNode2);
        nodeMap.put("3", serviceNode3);
        nodeMap.put("4", serviceNode4);
        nodeMap.put("5", serviceNode5);

        branches = StandardControllerServiceProvider.determineEnablingOrder(nodeMap);
        assertEquals(5, branches.size());

        ordered = branches.get(0);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode2);
        assertTrue(ordered.get(1) == serviceNode1);

        assertEquals(1, branches.get(1).size());
        assertTrue(branches.get(1).get(0) == serviceNode2);

        ordered = branches.get(2);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode4);
        assertTrue(ordered.get(1) == serviceNode3);

        assertEquals(1, branches.get(3).size());
        assertTrue(branches.get(3).get(0) == serviceNode4);

        assertEquals(1, branches.get(4).size());
        assertTrue(branches.get(4).get(0) == serviceNode5);

        // create 2 branches both dependent on the same service
        nodeMap.clear();
        serviceNode1.setProperty(ServiceA.OTHER_SERVICE.getName(), "2");
        serviceNode3.setProperty(ServiceA.OTHER_SERVICE.getName(), "2");
        nodeMap.put("1", serviceNode1);
        nodeMap.put("2", serviceNode2);
        nodeMap.put("3", serviceNode3);

        branches = StandardControllerServiceProvider.determineEnablingOrder(nodeMap);
        assertEquals(3, branches.size());

        ordered = branches.get(0);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode2);
        assertTrue(ordered.get(1) == serviceNode1);

        ordered = branches.get(1);
        assertEquals(1, ordered.size());
        assertTrue(ordered.get(0) == serviceNode2);

        ordered = branches.get(2);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0) == serviceNode2);
        assertTrue(ordered.get(1) == serviceNode3);
    }

    private ProcessorNode createProcessor(final StandardProcessScheduler scheduler, final ControllerServiceProvider serviceProvider) {
        final ProcessorNode procNode = new StandardProcessorNode(new DummyProcessor(), UUID.randomUUID().toString(),
                new StandardValidationContextFactory(serviceProvider, null), scheduler, serviceProvider);

        final ProcessGroup group = new StandardProcessGroup(UUID.randomUUID().toString(), serviceProvider, scheduler, null, null, null, variableRegistry);
        group.addProcessor(procNode);
        procNode.setProcessGroup(group);

        return procNode;
    }

    @Test
    public void testEnableReferencingComponents() {
        final StandardProcessScheduler scheduler = createScheduler();
        final StandardControllerServiceProvider provider = new StandardControllerServiceProvider(null, null, stateManagerProvider, variableRegistry);
        final ControllerServiceNode serviceNode = provider.createControllerService(ServiceA.class.getName(), "1", false);

        final ProcessorNode procNode = createProcessor(scheduler, provider);
        serviceNode.addReference(procNode);

        // procNode.setScheduledState(ScheduledState.STOPPED);
        provider.unscheduleReferencingComponents(serviceNode);
        assertEquals(ScheduledState.STOPPED, procNode.getScheduledState());

        // procNode.setScheduledState(ScheduledState.RUNNING);
        provider.unscheduleReferencingComponents(serviceNode);
        assertEquals(ScheduledState.STOPPED, procNode.getScheduledState());
    }
}
