import { Text, SafeAreaView } from 'react-native'
import React from 'react'
import { Link } from 'expo-router'

const Register = () => {
  return (
    <SafeAreaView>
      <Text>Register</Text>
      <Link href="/login"> Login</Link>
    </SafeAreaView>
  )
}

export default Register