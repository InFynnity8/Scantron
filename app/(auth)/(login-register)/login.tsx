import { Button, SafeAreaView, Text } from 'react-native'
import React, { useState } from 'react'

import LoginForm from '@/components/LoginForm';


const Login = () => {


  return (
    <SafeAreaView>
      <Text>login to youraccount</Text>
      <LoginForm/>
    </SafeAreaView>
  )
}

export default Login