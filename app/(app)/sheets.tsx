import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, IconButton, Screen, useToast } from '@/components/ui';
import { sheetPdfUrl, sheetPreviewUrl } from '@/lib/api';
import { builtinTemplateOptions, type TemplateOption } from '@/lib/templates';
import { colors, radius, space, themed, type, useColorScheme } from '@/lib/theme';

export default function PrintableSheets() {
  useColorScheme(); // re-render when light/dark mode changes
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<TemplateOption | null>(null);
  const templates = builtinTemplateOptions();

  const download = async (t: TemplateOption) => {
    setBusy(t.id);
    try {
      const dest = `${FileSystem.cacheDirectory}scantron-${t.id}.pdf`;
      const r = await FileSystem.downloadAsync(sheetPdfUrl(t.id), dest);
      if (r.status !== 200) throw new Error(`Server returned ${r.status}`);
      await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf', dialogTitle: 'Print or share answer sheet', UTI: 'com.adobe.pdf' });
    } catch (e: any) {
      toast(e?.message?.includes('Network') ? 'Connect to the internet to download sheets.' : e?.message ?? 'Download failed', 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Printable sheets">
      <FlatList
        data={templates}
        keyExtractor={(t) => t.id}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 40, gap: space.md }}
        ListHeaderComponent={
          <Text style={[type.bodyMuted, { marginBottom: space.xs }]}>
            Print these on A4 at 100% scale. The corner squares let your phone grade them live, even offline. Tap a sheet to
            see it full size.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => setOpen(item)} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]} accessibilityRole="button">
            <View style={styles.thumb}>
              <Image source={{ uri: sheetPreviewUrl(item.id, true) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </View>
            <Text style={[type.body, { fontWeight: '600', marginTop: space.sm }]} numberOfLines={2}>
              {item.numQuestions} questions{item.options.length !== 5 ? ` (${item.options[0]}–${item.options[item.options.length - 1]})` : ''}
            </Text>
            <Text style={type.caption} numberOfLines={2}>
              {item.id.startsWith('uni-') ? 'University layout, like the KNUST sheet' : `${item.idDigits}-digit index number`}
            </Text>
          </Pressable>
        )}
      />

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        {open && (
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
            <View style={styles.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={type.heading}>{open.name}</Text>
                <Text style={type.caption}>{open.description}</Text>
              </View>
              <IconButton icon="close" label="Close" onPress={() => setOpen(null)} />
            </View>
            <ScrollView contentContainerStyle={{ padding: space.lg }} maximumZoomScale={3} minimumZoomScale={1}>
              <View style={styles.page}>
                <Image source={{ uri: sheetPreviewUrl(open.id, true) }} style={StyleSheet.absoluteFill} resizeMode="contain" />
              </View>
              <View style={styles.facts}>
                <Fact icon="flash" text="Graded live on the phone, no internet needed" />
                <Fact icon="document-text-outline" text={`${open.numQuestions} questions · ${open.idDigits}-digit candidate / index number`} />
                <Fact icon="print-outline" text="Print on A4 at 100% (turn off “fit to page”)" />
              </View>
            </ScrollView>
            <View style={styles.dock}>
              <Button title="Download PDF to print" icon="download-outline" loading={busy === open.id} onPress={() => download(open)} />
            </View>
          </SafeAreaView>
        )}
      </Modal>
    </Screen>
  );
}

function Fact({ icon, text }: { icon: React.ComponentProps<typeof Icon>['name']; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Icon name={icon} size={16} color={colors.textMuted} />
      <Text style={[type.bodyMuted, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = themed(() => ({
  tile: { flex: 1, maxWidth: '50%' },
  thumb: {
    aspectRatio: 210 / 297,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  page: {
    aspectRatio: 210 / 297,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  facts: { gap: space.sm, marginTop: space.lg },
  dock: { padding: space.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
}));
