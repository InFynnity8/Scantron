import React from 'react';
import { Text, View } from 'react-native';
import { RadioButton } from 'react-native-paper';

const RadioButtonCustom = ({
  questionIndex,
  selectedOption,
  onSelect
}: {
  questionIndex: number,
  selectedOption: number,
  onSelect: any
}) => {
  return (
    <RadioButton.Group
      onValueChange={(newValue) => onSelect(questionIndex, newValue)}
      value={selectedOption.toString()}
    >
      <View className='flex flex-row w-full' style={{ marginBottom: 2 }}>
        {['A', 'B', 'C', 'D', 'E'].map((label, i) => (
          <View key={i} className="flex items-center mx-2">
            <Text
              style={{
                color: "#FFD600",
                fontWeight: selectedOption == i ? "bold" : "normal",
                fontSize: 16,
                marginBottom: 2,
              }}
            >
              [{label}]
            </Text>
            <View
              style={{
                backgroundColor: selectedOption == i ? "#232634" : "#181A20",
                borderRadius: 50,
                borderWidth: 1,
                borderColor: selectedOption == i ? "#FFD600" : "#393B44",
                marginTop: 2,
              }}
            >
              <RadioButton
                value={String(i)}
                color="#FFD600"
                uncheckedColor="#393B44"
                status={selectedOption == i ? 'checked' : 'unchecked'}
              />
            </View>
          </View>
        ))}
      </View>
    </RadioButton.Group>
  );
}

export default RadioButtonCustom