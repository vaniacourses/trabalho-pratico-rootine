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
    const inFlashcards = segments[0] === "flashcards";
    const inDiagnostic = segments[0] === "diagnostic";
    const inTabs = segments[0] === "(tabs)";

    if (!session) {
      if (!inAuthGroup) router.replace("/auth");
    } else {
      // Já está em rota protegida ou dentro das tabs — não redirecionar
      if (inFlashcards || inDiagnostic || inTabs) return;

      // Só verificar onboarding se vem de auth ou da raiz
      if (inAuthGroup || segments.length === 0) {
        checkDiagnosticStatus(session.user.id);
      }
    }
  }, [session, isReady, segments]);

  // Função isolada e com tratamento de erro (Evita o 406)
  const checkDiagnosticStatus = async (userId: string) => {
    try {
      // Usamos getUser() para garantir que a sessão é válida no servidor
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error("Sessão inválida:", authError);
        await supabase.auth.signOut();
        router.replace("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        // Se for erro de permissão (403/401), desloga
        if (error.code === "42501" || error.message.includes("JWT")) {
          await supabase.auth.signOut();
          router.replace("/auth");
          return;
        }
        throw error;
      }

      const needsDiagnostic = !data?.onboarding_completed;

      if (needsDiagnostic) {
        router.replace("/diagnostic");
      } else {
        router.replace("/(tabs)");
      }
    } catch (e) {
      console.error("Erro ao verificar diagnóstico:", e);
      // Evita loop: se der erro, não tenta redirecionar se já estivermos em algum lugar seguro
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
      <Stack.Screen name="flashcards/index" />
    </Stack>
  );
}
