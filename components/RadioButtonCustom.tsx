import { View, Text } from 'react-native'
import React from 'react'
import { RadioButton } from 'react-native-paper';

const RadioButtonCustom = ({ questionIndex, selectedOption, onSelect } : {questionIndex: number, selectedOption: any, onSelect: any}) => {

    return (
        <RadioButton.Group onValueChange={(newValue) => onSelect(questionIndex, newValue)}
      value={selectedOption}>
            <View className='flex flex-row w-full ' style={{ marginBottom: 2 }}>
                {['A', 'B', 'C', 'D', 'E'].map((label, i) => (
          <View key={i} className="flex items-center mx-2">
            <Text>[{label}]</Text>
            <View style={{ backgroundColor: i % 2 === 0 ? "#2196F3" : "#73bffa", marginTop: 2 }}>
              <RadioButton value={String(i)} />
            </View>
          </View>
        ))}
            </View>
        </RadioButton.Group>
    );
}

export default RadioButtonCustom