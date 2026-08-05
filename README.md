# ZenList

App de gestão de demandas por projeto (quadros estilo Trello, cards coloridos, checklist e figurinhas de status "FerMood"), com login e **sincronização em tempo real entre dispositivos** via Firebase.

## 1. Configurar o Firebase (obrigatório para login e sincronização)

1. Crie um projeto gratuito em https://console.firebase.google.com
2. No menu lateral, vá em **Compilação → Authentication → Sign-in method** e ative o provedor **E-mail/senha**.
3. Vá em **Compilação → Firestore Database → Criar banco de dados** (modo produção).
4. Em **Firestore → Regras**, cole e publique:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /zenlist_users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. Nas **Configurações do projeto** (ícone de engrenagem → Configurações do projeto → aba Geral), role até "Seus apps" e clique no ícone `</>` para criar um app Web. Copie o objeto de configuração que aparece.
6. Abra o arquivo `firebase-config.js` desta pasta e substitua os valores de exemplo pelos que você copiou.

Pronto — sem esse passo, o app mostra a mensagem "Firebase não configurado" na tela de login e não funciona (é o comportamento esperado até você preencher suas chaves).

## 2. Como funciona a sincronização

- Cada pessoa cria uma conta (e-mail + senha) ou entra com uma já existente.
- Os dados (projetos, cards, checklists, figurinhas) ficam salvos no Firestore, vinculados à conta.
- Ao logar com a **mesma conta** em outro celular/computador, os dados aparecem automaticamente — e qualquer mudança feita em um dispositivo aparece em tempo real nos outros (sem precisar recarregar a página).
- O indicador no topo mostra "Sincronizado", "Sincronizando…" ou "Offline".
- O app também funciona offline (graças à persistência do Firestore) e sincroniza quando a internet voltar.

## 3. Publicar no GitHub Pages

1. Suba a pasta inteira (incluindo `icons/`, `firebase-config.js` já preenchido, `manifest.json`, `sw.js`) para um repositório.
2. Em **Settings → Pages**, escolha a branch e a pasta raiz.
3. Acesse a URL gerada (`https://seu-usuario.github.io/repo/`) — precisa ser HTTPS para o login, a instalação (PWA) e o service worker funcionarem.

## Observação de segurança

O arquivo `firebase-config.js` contém identificadores públicos do projeto (não é uma senha secreta) — é normal e esperado que ele fique visível no código do app. Quem protege os dados de cada pessoa são as **regras do Firestore** do passo 4 acima, não o sigilo dessas chaves.
