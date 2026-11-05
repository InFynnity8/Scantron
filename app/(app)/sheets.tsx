import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { Badge, Button, Card, Notice, Screen, useToast } from '@/components/ui';
import { sheetPdfUrl } from '@/lib/api';
import { builtinTemplateOptions } from '@/lib/templates';
import { space, type } from '@/lib/theme';

export default function PrintableSheets() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const templates = builtinTemplateOptions();

  const download = async (id: string) => {
    setBusy(id);
    try {
      const dest = `${FileSystem.cacheDirectory}scantron-${id}.pdf`;
      const r = await FileSystem.downloadAsync(sheetPdfUrl(id), dest);
      if (r.status !== 200) throw new Error(`Server returned ${r.status}`);
      await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf', dialogTitle: 'Print or share answer sheet', UTI: 'com.adobe.pdf' });
    } catch (e: any) {
      toast(e?.message?.includes('Network') ? 'Connect to the internet to download sheets.' : e?.message ?? 'Download failed', 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Printable answer sheets">
      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={
          <View style={{ marginBottom: space.lg }}>
            <Notice
              tone="success"
              icon="flash"
              text="These sheets have corner markers, so they are graded live on your phone - even offline. Print on A4 at 100% scale (no 'fit to page')."
            />
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={type.heading}>{item.name}</Text>
              <Text style={type.caption}>{item.description}</Text>
              <View style={{ marginTop: 6 }}>
                <Badge text={item.id} />
              </View>
            </View>
            <Button title="PDF" icon="download-outline" compact loading={busy === item.id} onPress={() => download(item.id)} />
          </Card>
        )}
      />
    </Screen>
  );
}
