import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// ============================================================
// ATUALIZAÇÃO FORÇADA DO SERVICE WORKER
// ============================================================
// O app é um PWA: o service worker guarda o bundle inteiro e continua
// servindo a versão antiga depois de um deploy. Ele tem `skipWaiting`, então
// se atualiza — mas só quando o navegador resolve conferir, e enquanto isso
// o usuário vê código velho sem nenhum sinal disso.
//
// Custou horas nesta operação: o servidor já servia a correção e o navegador
// continuava com o erro anterior, sem forma de distinguir "não consertou" de
// "não chegou".
//
// Aqui a conferência passa a ser explícita, na abertura e a cada 15 minutos
// para quem deixa a aba aberta o dia inteiro. Quando um worker novo assume,
// a página recarrega uma vez — só uma, a trava evita laço.
if ('serviceWorker' in navigator) {
  let jaRecarregou = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (jaRecarregou) return;
    jaRecarregou = true;
    window.location.reload();
  });

  navigator.serviceWorker.ready
    .then((registration) => {
      void registration.update();
      setInterval(() => void registration.update(), 15 * 60 * 1000);
    })
    .catch(() => {
      // Sem service worker o app funciona igual — só não tem cache offline.
    });
}
