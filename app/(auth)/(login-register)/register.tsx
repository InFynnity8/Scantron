import { SafeAreaView } from 'react-native'
import React from 'react'
import RegisterForm from '@/components/RegisterForm'

const Register = () => {
  return (
    <SafeAreaView className='w-full h-full bg-white'>
      <RegisterForm/>
    </SafeAreaView>
  )
}

export default Register