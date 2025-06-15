import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from "expo-router";
import React from "react";
import { View, Text } from "react-native";

const _layout = () => {
    return (
        <Tabs
            screenOptions={
                ({ route }) => ({
                    tabBarShowLabel: false,
                    tabBarStyle: {
                        // backgroundColor: "rgb(31,36,85)",
                        borderTopWidth: 0,
                        // paddingVertical: 10
                        // height: 100,
                        flexDirection:  "row",
                        justifyContent: "center",
                        // alignItems: "center"
                    },
                    tabBarIcon: ({ focused, color, size }) => {
                        let IconName: any;
                        let label = "";
                        if (route.name === "index") {
                            IconName = "home"
                            label = "Home"
                        } else if (route.name === "scan") {
                            IconName = "scan"
                            label = "Scan"
                        } else if (route.name === "web") {
                            IconName = "globe-outline"
                            label = "Web"
                        }

                        return (
                            <View
                            style={{
                                backgroundColor: focused ? "rgb(31,36,85)": "transparent",
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                borderRadius: 999,
                                // justifyContent: "center",
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                marginTop: 10,
                                gap: 6,
                                width: 85,
                                height: 40
                            }}
                            >
                                <Ionicons name={IconName} size={20} color={focused ? "white" : color} />
                                {/* {focused && */}
                                    <Text className={`${focused ?'text-white' : color}`}>
                                        {label}
                                    </Text>
                                    {/* } */}
                            </View>
                        )
                    }
                })
            }
        >
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
                    title: 'Scan'
                }}
            />
            <Tabs.Screen
                name="web"
                options={{
                    headerShown: false,
                    title: 'Web'
                }}
            />
        </Tabs>
    )
}

export default _layout