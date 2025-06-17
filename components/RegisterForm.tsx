import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Link, router } from 'expo-router'
import * as SecureStore from 'expo-secure-store';
import { AntDesign } from '@expo/vector-icons';


export default function RegisterForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');


    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Validation Error', 'Please fill in all fields');
            return;
        }

        console.log('Logging in with:', email, password);
        await SecureStore.setItemAsync("token", "Myown");
        router.replace("/");
    };


    return (
        <View style={styles.container} >
            <View style={{ marginBottom: 40, display: "flex", alignItems: "center" }}>
                <Text style={styles.title}>Create an account</Text>
                <View className='flex flex-row'>
                    <Text style={{ color: "rgb(202,202,203)", fontSize: 16, fontWeight: "500" }}>Already have an account? </Text>
                    <Link href="/login">Login</Link>
                </View>
            </View>
            <View style={{ marginBottom: 10 }}>
                <Text style={{ fontWeight: "500", marginBottom: 10, fontSize: 18 }} > Full Name</Text>
                <TextInput
                    placeholder="John Doe"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                    textContentType='name'
                />
            </View>
            <View style={{ marginBottom: 10 }}>
                <Text style={{ fontWeight: "500", marginBottom: 10, fontSize: 18 }} >Email Address</Text>
                <TextInput
                    placeholder="infynnity@ghost.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.input}
                    textContentType='emailAddress'
                />
            </View>
            <View>
                <Text style={{ fontWeight: "500", marginBottom: 10, fontSize: 18 }}>Password</Text>
                <TextInput
                    placeholder=""
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    style={styles.input}
                />
            </View>

            <View className='w-full flex items-center flex-row justify-between' style={{ marginBottom: 10 }}>
                <Text style={{ color: "rgb(202,202,203)", fontSize: 16, fontWeight: "500" }}>Forgot Password</Text>
            </View>

            <TouchableOpacity onPress={handleLogin} style={{ backgroundColor: "rgb(31,36,85)", borderRadius: 200, padding: 13, display: "flex", alignItems: 'center' }}>
                <Text className='text-white text-[18px] font-bold'>
                    Register
                </Text>
            </TouchableOpacity>
            <View className='flex items-center w-full' style={{ position: "relative", marginVertical: 30 }}>
                <View className='w-full' style={{ position: "absolute", backgroundColor: "rgb(202,202,203)", height: 1, top: 10 }} />
                <Text style={{ backgroundColor: "white", paddingHorizontal: 5 }}>Or continue with</Text>
            </View>
            <View className='flex flex-row items-center w-full justify-around'>
                <TouchableOpacity onPress={handleLogin} className='border flex flex-row items-center justify-center' style={{ borderColor: "rgb(202,202,203)", width: 160, backgroundColor: "transparent", borderRadius: 200, padding: 13, display: "flex", alignItems: 'center' }}>
                    <AntDesign name="google" size={24} color="black" style={{ marginHorizontal: 5 }} />
                    <Text className='text-black text-[18px] font-bold'>
                        Google
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity className='border flex flex-row items-center justify-center' onPress={handleLogin} style={{ borderColor: "rgb(202,202,203)", width: 160, backgroundColor: "transparent", borderRadius: 200, padding: 13, display: "flex", alignItems: 'center' }}>
                    <AntDesign name="apple1" size={24} color="black" style={{ marginHorizontal: 5 }} />
                    <Text className='text-black text-[18px] font-bold'>
                        Apple
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontSize: 30,
        fontWeight: "600",
        alignSelf: 'center',
    },
    input: {
        backgroundColor: "rgba(222,222,223,0.38)",
        borderRadius: 200,
        padding: 13,
        paddingHorizontal: 20,
        marginBottom: 12,
        color: "black",
        fontSize: 18
    },
});
