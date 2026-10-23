import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
      <div className="text-6xl font-black text-[#E30613]">404</div>
      <div className="text-xl font-semibold text-[#252733] mt-2">Página não encontrada</div>
      <div className="text-sm text-[#858A98] mt-1">A rota que você tentou acessar não existe.</div>
      <Link to="/" className="mt-4 px-4 py-2 rounded-xl bg-[#E30613] text-white text-sm font-medium">Voltar ao início</Link>
    </div>
  );
}
