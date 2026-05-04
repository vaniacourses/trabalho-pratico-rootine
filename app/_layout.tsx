import { supabase } from "@/lib/supabase";
import { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const inAuthGroup = segments[0] === "auth";

    if (!session && !inAuthGroup) {
      router.replace("/auth");
    } else if (session) {
      // SÓ faz a verificação se estiver na tela de auth (acabou de logar/cadastrar)
      if (inAuthGroup) {
        checkDiagnosticStatus(session.user.id);
      }
    }
  }, [session, isReady]); // ❌ Removemos 'segments' daqui!

  // Função isolada e com tratamento de erro (Evita o 406)
  const checkDiagnosticStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("socioeconomic_context")
        .eq("id", userId)
        .maybeSingle(); // maybeSingle não quebra com erro 406 se retornar 0 linhas

      if (error) throw error;

      const needsDiagnostic =
        !data?.socioeconomic_context ||
        Object.keys(data.socioeconomic_context).length === 0;

      if (needsDiagnostic) {
        router.replace("/diagnostic");
      } else {
        router.replace("/");
      }
    } catch (e) {
      console.error("Erro ao verificar diagnóstico:", e);
      router.replace("/"); // Em caso de pane no banco, prioriza mandar pra Home
    }
  };

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="diagnostic/index" />
    </Stack>
  );
}
