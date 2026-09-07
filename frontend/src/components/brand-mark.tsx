import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";
import { makeStyles, useTheme } from "@/src/theme";

const LOGO = require("../../assets/images/punch-desk-logo.png");

export function BrandMark({ compact = false, hideText = false }: { compact?: boolean; hideText?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, compact && styles.compactWrap]}>
      <Image
        source={LOGO}
        contentFit="contain"
        style={compact ? styles.logoCompact : styles.logo}
        transition={200}
      />
      {!hideText ? (
        <View>
          <Text style={[styles.name, compact && styles.compactName]}>
            Punch <Text style={{ color: colors.brandPrimary }}>Desk</Text>
          </Text>
          {!compact ? <Text style={styles.kicker}>REAL PEOPLE. CLOSE BY.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function BrandHero() {
  const styles = useStyles();
  return (
    <View style={styles.heroWrap}>
      <Image source={LOGO} contentFit="contain" style={styles.heroLogo} transition={250} />
    </View>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    wrap: { flexDirection: "row", alignItems: "center", gap: 12 },
    compactWrap: { gap: 8 },
    logo: { width: 52, height: 52, borderRadius: 14 },
    logoCompact: { width: 34, height: 34, borderRadius: 10 },
    name: { color: colors.onSurface, fontSize: 26, fontWeight: "800", letterSpacing: -1 },
    compactName: { fontSize: 18, letterSpacing: -0.4 },
    kicker: { color: colors.muted, fontSize: 10, letterSpacing: 2, marginTop: 2 },
    heroWrap: { alignItems: "center", justifyContent: "center", marginTop: 12 },
    heroLogo: { width: 240, height: 240 },
  })
);
