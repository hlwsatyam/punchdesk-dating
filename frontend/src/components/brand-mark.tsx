import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { makeStyles, useTheme } from "@/src/theme";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, compact && styles.compactWrap]}>
      <View style={[styles.mark, compact && styles.compactMark, { backgroundColor: colors.brandPrimary }]}>
        <Ionicons name="heart" size={compact ? 16 : 26} color={colors.onBrandPrimary} />
      </View>
      <View>
        <Text style={[styles.name, compact && styles.compactName]}>Punch <Text style={styles.nameAccent}>Desk</Text></Text>
        {!compact ? <Text style={styles.kicker}>REAL PEOPLE. CLOSE BY.</Text> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 12 },
  compactWrap: { gap: 8 },
  mark: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  compactMark: { width: 34, height: 34, borderRadius: 12 },
  name: { color: colors.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -1 },
  compactName: { fontSize: 19, letterSpacing: -0.5 },
  nameAccent: { color: colors.brandPrimary },
  kicker: { color: colors.muted, fontSize: 10, letterSpacing: 2, marginTop: 2 },
}));