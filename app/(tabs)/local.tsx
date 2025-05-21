import React, { useState } from 'react';
import { SafeAreaView, Button, Image, Text, ActivityIndicator, View } from 'react-native';
import axios from 'axios';
import { Asset } from 'expo-asset';

export default function SendLocalImage() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const sendLocalImage = async () => {
        setLoading(true);

        try {
            // Load the image from assets
            const asset = Asset.fromModule(require('@/assets/images/test_01.png'));
            await asset.downloadAsync(); // Make sure it's downloaded
            const uri = asset.localUri || asset.uri;

            const formData = new FormData();
            formData.append('file', {
                uri,
                name: 'image.png',
                type: 'image/png',
            } as any); // React Native types might complain, so cast as `any`

            const response = await axios.post("https://bubble-sheet-marker-backend.onrender.com/scan", formData, {
                headers: {
                    Accept: 'application/json',
                },
            });
            setResult(response.data);
            console.log('Response:', response.data);
        } catch (error) {
            console.error('Upload failed:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ padding: 20 }}>
            <Button title="Send This Image to Backend" onPress={sendLocalImage} />
            <View className='flex flex-col items-center justify-center h-full'>
                <Image
                    source={require('@/assets/images/test_01.png')}
                    style={{ width: 200, height: 300, marginTop: 20 }}
                />
            </View>
            {loading && <ActivityIndicator />}
            {result && <Text>Result: {JSON.stringify(result)}</Text>}
        </SafeAreaView>
    );
}
