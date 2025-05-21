import React, { useState } from 'react';
import axios from 'axios';
import { Platform, View, Text, SafeAreaView, Image } from 'react-native';

interface ResponseType {
    score: number,
    ID: number,
    score_percentage: number,
    total_questions: number,
    choices: object,
    annotated_image: string,
    annotated_image_id: string,
    annotated_image_marked: string
}

function UploadImage() {
    const [image, setImage] = useState<File | null>(null);
    const [res, setRes] = useState<ResponseType | null>(null)
    const [loading, setLoading] = useState(false);
    // const [formatedChoices, setFormatedChoices] = useState<string[]>([])
    const handleImageChange = (e: any) => {
        setImage(e.target.files[0]);
    };

    const handleChoices = (choices: any[]) => {
        let formatedChoices: any[] = []
        choices.map((choice, quesion_num) => {
            switch (choice) {
                case 0:
                    formatedChoices.push(`${quesion_num + 1}:A`)
                    break;
                case 1:
                    formatedChoices.push(`${quesion_num + 1}:B`)
                    break;
                case 2:
                    formatedChoices.push(`${quesion_num + 1}:C`)
                    break;
                case 3:
                    formatedChoices.push(`${quesion_num + 1}:D`)
                    break;
                case 4:
                    formatedChoices.push(`${quesion_num + 1}:E`)
                    break;

                default:
                    formatedChoices.push(`${quesion_num + 1}:None`)
                    break;
            }
        })
        // setFormatedChoices(formatedChoices)
        return formatedChoices
    }

    const handleUpload = async () => {
        setLoading(true);
        const formData = new FormData();
        if (image) {
            formData.append('file', image);
        }

        try {
            const response = await axios.post('http://127.0.0.1:5000/scan', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            console.log(response.data);
            setLoading(false);
            setRes(response.data);
        } catch (error) {
            setLoading(false);
            console.error('Error uploading image:', error);
        }
    };

    return (
        <SafeAreaView>
            {Platform.OS === 'web' ? (
                <div className=' flex flex-col items-center justify-center h-full w-full'>
                    <div className="">
                        <input type="file" accept="image/*" onChange={handleImageChange} />
                        <button className='bg-blue-400 cursor-pointer p-2 text-white m-2 px-2' onClick={handleUpload} disabled={!image}>Upload</button>
                    </div>
                    {/* images */}
                    <div className="flex items-center justify-between ">
                        {
                            image && (
                                <div>
                                    <h3>Choosen Image:</h3>
                                    <img src={URL.createObjectURL(image)} alt="Selected" style={{ width: '200px', height: '270px' }} />

                                </div>
                            )
                        }
                        {loading ? <p>Loading...</p> : res && (
                            <div className='mx-2 flex '>
                                {/* Paper Results */}
                                <div className="">
                                    <p>Results:</p>
                                    <img
                                        src={res.annotated_image}
                                        alt="Annotated Bubble Sheet"
                                        style={{ width: "200px", height: "270px", objectFit: 'contain' }}
                                    />
                                </div>
                                {/* Marked sheet */}
                                <div className="">
                                    <p>Marked Sheet:</p>
                                    <img
                                        src={res.annotated_image_marked}
                                        alt="Annotated Bubble Sheet Marked"
                                        style={{ width: "200px", height: "270px", objectFit: 'contain' }}
                                    />
                                </div>
                                {/* ID sheet */}
                                <div className="">
                                    <p>ID Annotation:</p>
                                    <img
                                        src={res.annotated_image_id}
                                        alt="Annotated Bubble Sheet ID"
                                        style={{ width: "200px", height: "270px", objectFit: 'contain' }}
                                    />
                                </div>
                            </div>
                        )}

                    </div>
                    {/* info results */}
                    {res && (<div className="">
                        <h1 className='font-medium text-xl text-blue-500'>Info on this paper:</h1>
                        <p>Student Score: {res?.score_percentage}% ( {res?.score} out of {res?.total_questions} )</p>
                        <p>Student ID: {res.ID}</p>
                        <p>Student Choices: {handleChoices(Object.values(res.choices))}</p>
                    </div>)}

                </div>
            ) : (
                <View className='flex flex-col items-center justify-center h-full'>
                    <Text>Sorry, this will only work on the Web</Text>
                    {res && res.annotated_image && (
                        <Image
                            source={{ uri: res.annotated_image }}
                            style={{ width: 300, height: 400 }}
                        />
                    )}
                </View>
            )}
        </SafeAreaView>

    );
}

export default UploadImage;