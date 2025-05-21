import { Tabs } from "expo-router";
import React from "react";
import { View, Text } from "react-native";

const _layout = () => {
    return (
        <Tabs>
            <Tabs.Screen
                name="index"
                options={{
                    headerShown: false,
                    title: 'Home'
                }}
            />
            <Tabs.Screen
                name="scan"
                options={{
                    headerShown: false,
                    title: 'Capture'
                }}
            />
            <Tabs.Screen
                name="web"
                options={{
                    headerShown: false,
                    title: 'Web'
                }}
            />
            <Tabs.Screen
                name="local"
                options={{
                    headerShown: false,
                    title: 'Test'
                }}
            />
        </Tabs>
    )
}

export default _layout