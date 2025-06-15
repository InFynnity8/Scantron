// app/auth/login-register/_layout.tsx
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import Login from './login';
import Register from './register';
import { View, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

const Tab = createMaterialTopTabNavigator();

export default function LoginRegisterLayout() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarShowLabel: false,
                tabBarLabelStyle: { fontSize: 14, fontWeight: 'bold' },
                tabBarIndicatorStyle: { backgroundColor: 'rgb(31,36,85)' },
                tabBarStyle: { marginTop: 20 },
                tabBarIcon: ({ focused, color }) => {
                    let IconName: any;
                    let label = "";
                    if (route.name === "login") {
                        IconName = "person"
                        label = "Login"
                    } else if (route.name === "register") {
                        IconName = "finger-print"
                        label = "Register"
                    } 
                    return (
                        <View
                            style={{
                                // backgroundColor: focused ? "rgb(31,36,85)" : "transparent",
                                display: "flex",
                                flexDirection: "row",
                                alignItems: "center",
                                borderRadius: 999,
                                // justifyContent: "center",
                                paddingHorizontal: 10,
                                paddingVertical: 3,
                                // marginTop: 10,
                                gap: 6,
                                // width: 200,
                                // height: 40
                            }}
                        >
                            <Ionicons name={IconName} size={25} color={focused ? "rgb(31,36,85)" : color} />
                            <Text className={`${focused ? 'text-[rgb(31,36,85)]' : color} text-[18px]`}>
                                {label}
                            </Text>
                        </View>)
                }
            })}
        >
            <Tab.Screen name="login" component={Login} options={{ title: "Login" }} />
            <Tab.Screen name="register" component={Register} options={{ title: "Register" }} />
        </Tab.Navigator>
    );
}
