// ============================================================
// CONFIGURAÇÃO DO GOOGLE CALENDAR
// ============================================================
// Isso permite que o ZenList leia (somente leitura) os compromissos
// da sua Google Agenda e mostre no painel do dia.
//
// 1. Acesse https://console.cloud.google.com e crie um projeto
//    (ou use um que já tenha).
// 2. Vá em "APIs e serviços" > "Biblioteca", procure por
//    "Google Calendar API" e clique em "Ativar".
// 3. Vá em "APIs e serviços" > "Tela de consentimento OAuth":
//    - Tipo de usuário: Externo (ou Interno, se for Google Workspace)
//    - Preencha nome do app, e-mail de suporte
//    - Em "Escopos", não precisa adicionar nada aqui manualmente
//    - Se o app ficar em modo "Teste", adicione seu e-mail (e de quem
//      mais for usar) em "Usuários de teste" — senão o login falha
// 4. Vá em "APIs e serviços" > "Credenciais" > "Criar credenciais"
//    > "ID do cliente OAuth":
//    - Tipo de aplicativo: "Aplicativo da Web"
//    - Em "Origens JavaScript autorizadas", adicione a URL exata
//      do seu site (ex.: https://seuusuario.github.io)
//      (sem barra "/" no final, e sem o caminho da página)
//    - Se testar em localhost, adicione também http://localhost:PORTA
// 5. Copie o "ID do cliente" gerado (termina em
//    ".apps.googleusercontent.com") e cole abaixo.
// ============================================================

window.GOOGLE_CLIENT_ID = "224315901707-9nd6qi0g7hp192hfka73lpqiioiebvnp.apps.googleusercontent.com";
