import { Stack } from "expo-router";
import React from "react";

const _layout = () => {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#181A20" }, // optional: match your theme
            }}
        />
    );
};

export default _layout;