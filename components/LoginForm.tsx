import { AntDesign } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useState } from 'react';
import { Alert, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { Checkbox } from 'react-native-paper';

export default function LoginForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [checked, setChecked] = useState(false);
    const [emailFocused, setEmailFocused] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Validation Error', 'Please fill in all fields');
            return;
        }
        await SecureStore.setItemAsync("token", "Myown");
        router.replace("/");
    };

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.container} >
                <View style={{ marginBottom: 40, display: "flex", alignItems: "center" }}>
                    <Text style={styles.title}>Welcome Back</Text>
                    <View style={{ flexDirection: "row" }}>
                        <Text style={{ color: "#CACACB", fontSize: 16, fontWeight: "500" }}>Don&apos;t have an account? </Text>
                        <Link href="/register" style={{ color: "#FFD600", fontWeight: "bold" }}>Register</Link>
                    </View>
                </View>
                <View style={{ marginBottom: 10 }}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                        placeholder="infynnity@ghost.com"
                        placeholderTextColor="#888"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        style={[
                            styles.input,
                            emailFocused && styles.inputFocused
                        ]}
                        textContentType='emailAddress'
                        onFocus={() => setEmailFocused(true)}
                        onBlur={() => setEmailFocused(false)}
                    />
                </View>
                <View>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        placeholder="••••••••"
                        placeholderTextColor="#888"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        style={[
                            styles.input,
                            passwordFocused && styles.inputFocused
                        ]}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                    />
                </View>

                <View style={styles.row}>
                    <View style={styles.checkboxRow}>
                        <Checkbox
                            status={checked ? 'checked' : 'unchecked'}
                            onPress={() => setChecked(!checked)}
                            color="#FFD600"
                            uncheckedColor="#FFD600"
                        />
                        <Text style={styles.checkboxLabel}>Remember me</Text>
                    </View>
                    <Text style={{ color: "#FFD600", fontSize: 16, fontWeight: "500" }}>Forgot Password</Text>
                </View>

                <TouchableOpacity onPress={handleLogin} style={styles.loginBtn}>
                    <Text style={styles.loginBtnText}>
                        Login
                    </Text>
                </TouchableOpacity>
                <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>Or continue with</Text>
                </View>
                <View style={styles.socialRow}>
                    <TouchableOpacity onPress={handleLogin} style={styles.socialBtn}>
                        <AntDesign name="google" size={24} color="#FFD600" style={{ marginHorizontal: 5 }} />
                        <Text style={styles.socialBtnText}>
                            Google
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleLogin} style={styles.socialBtn}>
                        <AntDesign name="apple1" size={24} color="#FFD600" style={{ marginHorizontal: 5 }} />
                        <Text style={styles.socialBtnText}>
                            Apple
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
        flex: 1,
        justifyContent: 'center',
        backgroundColor: "#181A20",
    },
    title: {
        fontSize: 30,
        fontWeight: "600",
        alignSelf: 'center',
        color: "#FFD600",
    },
    label: {
        fontWeight: "500",
        marginBottom: 10,
        fontSize: 18,
        color: "#FFD600"
    },
    input: {
        backgroundColor: "#232634",
        borderRadius: 8,
        padding: 13,
        paddingHorizontal: 20,
        marginBottom: 12,
        color: "#fff",
        fontSize: 18,
        borderWidth: 0,
    },
    inputFocused: {
        borderWidth: 0.5,
        borderColor: "#FFD600",
    },
    row: {
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    loginBtn: {
        backgroundColor: "#FFD600",
        borderRadius: 8,
        padding: 13,
        alignItems: 'center',
        marginTop: 10,
    },
    loginBtnText: {
        color: "#232634",
        fontSize: 18,
        fontWeight: "bold"
    },
    dividerContainer: {
        alignItems: 'center',
        width: "100%",
        position: "relative",
        marginVertical: 30
    },
    dividerLine: {
        position: "absolute",
        backgroundColor: "#232634",
        height: 1,
        width: "100%",
        top: 10
    },
    dividerText: {
        backgroundColor: "#181A20",
        color: "#FFD600",
        paddingHorizontal: 5,
        zIndex: 1
    },
    socialRow: {
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        justifyContent: "space-around"
    },
    socialBtn: {
        borderWidth: 1,
        borderColor: "#FFD600",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        width: 160,
        backgroundColor: "#232634",
        borderRadius: 8,
        padding: 13,
    },
    socialBtnText: {
        color: "#FFD600",
        fontSize: 18,
        fontWeight: "bold"
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkboxLabel: {
        color: "#CACACB",
        fontSize: 16,
        marginLeft: 2,
        fontWeight: "500"
    }
});
