import { supabase } from "@/lib/supabase";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

function getAuthErrorMessage(error: unknown, isSignUp: boolean) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message)
        : "Não foi possível autenticar agora.";

  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code)
      : "";

  if (code === "over_email_send_rate_limit" || message.includes("rate limit")) {
    return "Muitas tentativas de cadastro em pouco tempo. Aguarde cerca de 1 hora e tente novamente.";
  }

  if (message.includes("Invalid login credentials")) {
    return isSignUp
      ? "Não foi possível concluir o cadastro. Tente outro e-mail ou faça login se a conta já existir."
      : "E-mail ou senha incorretos. Se você acabou de migrar de projeto Supabase, cadastre-se de novo neste ambiente.";
  }

  if (message.includes("Email not confirmed")) {
    return "Confirme seu e-mail antes de entrar. Verifique a caixa de entrada e o spam.";
  }

  if (message.includes("User already registered")) {
    return "Este e-mail já está cadastrado. Use a opção Entrar.";
  }

  if (message.includes("Password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (
    message.includes("fetch") ||
    message.includes("Failed to send") ||
    message.includes("Network")
  ) {
    return "Falha de conexão com o Supabase. Teste outra rede, VPN ou aguarde alguns minutos.";
  }

  return message;
}

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleAuth() {
    // 1. Validação inicial para evitar chamadas desnecessárias à API
    if (!email || !password || (isSignUp && !fullName)) {
      Alert.alert(
        "Campos obrigatórios",
        "Por favor, preencha todos os campos para prosseguir.",
      );
      return;
    }

    setLoading(true);
    console.log(
      `[AUTH] Iniciando ${isSignUp ? "cadastro" : "login"} para: ${email}`,
    );

    try {
      if (isSignUp) {
        // FLUXO DE CADASTRO
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: fullName },
            // Definimos como undefined para evitar conflitos de redirecionamento
            // enquanto testamos no ambiente local (localhost/IP).
            emailRedirectTo: undefined,
          },
        });

        if (error) throw error;

        console.log("[AUTH] Cadastro concluído com sucesso:", data.user?.id);

        if (data.user) {
          const { error: profileError } = await supabase.from("profiles").upsert(
            {
              id: data.user.id,
              name: fullName.trim() || data.user.email?.split("@")[0] || "Guardião",
              xp: 0,
              onboarding_completed: false,
            },
            { onConflict: "id" },
          );

          if (profileError) {
            console.error("[AUTH] Erro ao criar perfil:", profileError.message);
          }
        }

        // Feedback caso o e-mail de confirmação esteja ligado no dashboard
        if (!data.session) {
          Alert.alert(
            "Verifique seu e-mail",
            "Enviamos um link de confirmação para você.",
          );
        }
        // Se a sessão existir (confirmação desligada), o _layout.tsx detectará
        // automaticamente e enviará o usuário para o /diagnostic.
      } else {
        // FLUXO DE LOGIN
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        console.log("[AUTH] Login realizado com sucesso.");
        // O _layout.tsx detectará a sessão e enviará o usuário para a Home (/).
      }
    } catch (error: unknown) {
      const friendlyMessage = getAuthErrorMessage(error, isSignUp);
      console.error("[AUTH ERROR]:", friendlyMessage, error);
      Alert.alert("Erro na Autenticação", friendlyMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.logo}>🌱 Rootine</Text>
          <Text style={styles.subtitle}>
            {isSignUp
              ? "Junte-se à jornada sustentável"
              : "Sua árvore sente sua falta"}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>
            {isSignUp ? "Criar Conta" : "Entrar"}
          </Text>

          {isSignUp && (
            <TextInput
              placeholder="Nome Completo"
              style={styles.input}
              placeholderTextColor="#999"
              onChangeText={setFullName}
              autoCorrect={false}
            />
          )}

          <TextInput
            placeholder="E-mail"
            style={styles.input}
            placeholderTextColor="#999"
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            autoCorrect={false}
          />

          <TextInput
            placeholder="Senha"
            style={styles.input}
            placeholderTextColor="#999"
            secureTextEntry
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>
                {isSignUp ? "Cadastrar" : "Entrar"}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsSignUp(!isSignUp)}
            style={styles.switchButton}
          >
            <Text style={styles.switchText}>
              {isSignUp
                ? "Já tem uma conta? Faça login"
                : "Não tem conta? Cadastre-se agora"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F8" },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 25 },
  header: { alignItems: "center", marginBottom: 40 },
  logo: { fontSize: 32, fontWeight: "bold", color: "#1B5E20" },
  subtitle: { fontSize: 14, color: "#666", marginTop: 5 },
  form: {
    backgroundColor: "#FFF",
    padding: 25,
    borderRadius: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  label: { fontSize: 20, fontWeight: "bold", color: "#333", marginBottom: 20 },
  input: {
    backgroundColor: "#F9F9F9",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#EEE",
    color: "#333",
  },
  button: {
    backgroundColor: "#4CAF50",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: { backgroundColor: "#A5D6A7" },
  buttonText: { color: "#FFF", fontWeight: "bold", fontSize: 16 },
  switchButton: { marginTop: 25, alignItems: "center" },
  switchText: { color: "#4CAF50", fontWeight: "600", fontSize: 14 },
});
