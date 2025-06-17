import { Button, SafeAreaView, Text } from 'react-native'
import React, { useState } from 'react'

import LoginForm from '@/components/LoginForm';


const Login = () => {


  return (
    <SafeAreaView className='w-full h-full bg-white'>
      <LoginForm/>
    </SafeAreaView>
  )
}

export default Login