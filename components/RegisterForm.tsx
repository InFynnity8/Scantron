import { AntDesign } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

export default function RegisterForm() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [emailFocused, setEmailFocused] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);
    const [confirmFocused, setConfirmFocused] = useState(false);

    const handleRegister = async () => {
        if (!email || !password || !confirm) {
            Alert.alert('Validation Error', 'Please fill in all fields');
            return;
        }
        if (password !== confirm) {
            Alert.alert('Validation Error', 'Passwords do not match');
            return;
        }
        // Simulate registration
        router.replace("/login");
    };

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.container}>
                <View style={{ marginBottom: 40, alignItems: "center" }}>
                    <Text style={styles.title}>Create Account</Text>
                    <View style={{ flexDirection: "row", marginTop: 4 }}>
                        <Text style={{ color: "#CACACB", fontSize: 16 }}>Already have an account? </Text>
                        <Link href="/login" style={{ color: "#FFD600", fontWeight: "bold", fontSize: 16 }}>Login</Link>
                    </View>
                </View>
                <View style={{ marginBottom: 10 }}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                        placeholder="your@email.com"
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
                <View style={{ marginBottom: 10 }}>
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
                <View style={{ marginBottom: 10 }}>
                    <Text style={styles.label}>Confirm Password</Text>
                    <TextInput
                        placeholder="••••••••"
                        placeholderTextColor="#888"
                        value={confirm}
                        onChangeText={setConfirm}
                        secureTextEntry
                        style={[
                            styles.input,
                            confirmFocused && styles.inputFocused
                        ]}
                        onFocus={() => setConfirmFocused(true)}
                        onBlur={() => setConfirmFocused(false)}
                    />
                </View>
                <TouchableOpacity onPress={handleRegister} style={styles.registerBtn}>
                    <Text style={styles.registerBtnText}>Register</Text>
                </TouchableOpacity>
                <View style={styles.dividerContainer}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>Or sign up with</Text>
                </View>
                <View style={styles.socialRow}>
                    <TouchableOpacity onPress={handleRegister} style={styles.socialBtn}>
                        <AntDesign name="google" size={20} color="#FFD600" style={{ marginHorizontal: 5 }} />
                        <Text style={styles.socialBtnText}>Google</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleRegister} style={styles.socialBtn}>
                        <AntDesign name="apple1" size={20} color="#FFD600" style={{ marginHorizontal: 5 }} />
                        <Text style={styles.socialBtnText}>Apple</Text>
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
    registerBtn: {
        backgroundColor: "#FFD600",
        borderRadius: 8,
        padding: 13,
        alignItems: 'center',
        marginTop: 10,
    },
    registerBtnText: {
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
        width: 140,
        backgroundColor: "#232634",
        borderRadius: 8,
        padding: 10,
    },
    socialBtnText: {
        color: "#FFD600",
        fontSize: 16,
        fontWeight: "bold"
    }
});
