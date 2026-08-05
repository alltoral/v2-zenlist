// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================
// 1. Crie um projeto gratuito em https://console.firebase.google.com
// 2. No projeto, vá em "Compilação" > "Authentication" > "Sign-in method"
//    e ative o provedor "E-mail/senha".
// 3. Vá em "Compilação" > "Firestore Database" > "Criar banco de dados"
//    (pode escolher o modo de produção; as regras de segurança abaixo
//    cuidam do acesso).
// 4. Nas configurações do projeto (ícone de engrenagem > "Configurações
//    do projeto" > aba "Geral"), role até "Seus apps", clique no ícone
//    "</>" para criar um app da Web, e copie o objeto de configuração
//    que aparece — cole os valores abaixo, substituindo os exemplos.
// 5. Em Firestore > "Regras", cole:
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /zenlist_users/{uid} {
//          allow read, write: if request.auth != null && request.auth.uid == uid;
//        }
//      }
//    }
//
// ============================================================

window.FIREBASE_CONFIG = {
  apiKey: "COLE_AQUI_SUA_API_KEY",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxx"
};
