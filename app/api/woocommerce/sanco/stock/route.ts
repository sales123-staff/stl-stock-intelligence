import { NextResponse } from "next/server";

type SancoStockItem = {
  Filial?: string;
  Cliente?: string;
  Produto?: string;
  UnidadeMedida?: string;
  NumeroOrdem?: number | string;
  NumeroPedido?: string;
  NaturezaOperacao?: string;
  ClienteFaturamento?: string;
  Deposito?: string;
  Endereco?: string;
  Unitizacao?: number;
  Volume?: number;
  ClassificacaoEstoque?: string;
  NumeroOcorrencia?: number;
  NumeroDocumento?: number;
  NumeroDescarga?: number;
  Lote?: string;
  Fabricacao?: string;
  Validade?: string;
  Conteiner?: string;
  SaldoDisponivel?: {
    Quantidade?: number;
    PesoBruto?: number;
    PesoLiquido?: number;
    Valor?: number;
    Volume?: number;
  };
  SaldoReservado?: {
    Quantidade?: number;
    PesoBruto?: number;
    PesoLiquido?: number;
    Valor?: number;
    Volume?: number;
  };
  SaldoBloqueado?: {
    Quantidade?: number;
    PesoBruto?: number;
    PesoLiquido?: number;
    Valor?: number;
    Volume?: number;
  };
  SaldoAtual?: {
    Quantidade?: number;
    PesoBruto?: number;
    PesoLiquido?: number;
    Valor?: number;
    Volume?: number;
  };
  [key: string]: any;
};

function normalizeNumber(value: any): number {
  if (typeof value === "number") return value;
  if (!value) return 0;

  const parsed = Number(
    String(value)
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSancoItem(item: SancoStockItem) {
  return {
    codigo: item.Produto || String(item.NumeroOrdem || item.NumeroPedido || ""),
    produto: item.Produto || "Produto sem nome",

    filial: item.Filial || "",
    cliente: item.Cliente || "",
    unidadeMedida: item.UnidadeMedida || "",
    numeroOrdem: item.NumeroOrdem || "",
    numeroPedido: item.NumeroPedido || "",
    naturezaOperacao: item.NaturezaOperacao || "",
    clienteFaturamento: item.ClienteFaturamento || "",
    deposito: item.Deposito || "",
    endereco: item.Endereco || "",
    classificacaoEstoque: item.ClassificacaoEstoque || "",
    lote: item.Lote || "",
    fabricacao: item.Fabricacao || "",
    validade: item.Validade || "",
    conteiner: item.Conteiner || "",

    quantidadeDisponivel: normalizeNumber(item.SaldoDisponivel?.Quantidade),
    quantidadeReservada: normalizeNumber(item.SaldoReservado?.Quantidade),
    quantidadeBloqueada: normalizeNumber(item.SaldoBloqueado?.Quantidade),
    quantidadeAtual: normalizeNumber(item.SaldoAtual?.Quantidade),

    valorDisponivel: normalizeNumber(item.SaldoDisponivel?.Valor),
    valorReservado: normalizeNumber(item.SaldoReservado?.Valor),
    valorBloqueado: normalizeNumber(item.SaldoBloqueado?.Valor),
    valorAtual: normalizeNumber(item.SaldoAtual?.Valor),

    pesoBrutoDisponivel: normalizeNumber(item.SaldoDisponivel?.PesoBruto),
    pesoLiquidoDisponivel: normalizeNumber(item.SaldoDisponivel?.PesoLiquido),

    raw: item,
  };
}

export async function GET() {
  try {
    const baseUrl = process.env.SANCO_API_URL;

    if (!baseUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "SANCO_API_URL não configurada.",
          required: ["SANCO_API_URL"],
        },
        { status: 500 }
      );
    }

    const cleanBaseUrl = baseUrl.replace(/\/$/, "");
    const url = `${cleanBaseUrl}/armazem/ordem/estoqueMercadoria`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await response.text();

    let json: any;

    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "A SANCO não retornou JSON válido.",
          status: response.status,
          raw: text.slice(0, 1000),
        },
        { status: 500 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Erro ao consultar SANCO.",
          status: response.status,
          details: json,
        },
        { status: response.status }
      );
    }

    const estoqueMercadoria = Array.isArray(json?.EstoqueMercadoria)
      ? json.EstoqueMercadoria
      : Array.isArray(json?.estoqueMercadoria)
      ? json.estoqueMercadoria
      : Array.isArray(json)
      ? json
      : [];

    const items = estoqueMercadoria.map(normalizeSancoItem);

    const totalQuantidadeDisponivel = items.reduce(
      (acc: number, item: any) => acc + item.quantidadeDisponivel,
      0
    );

    const totalQuantidadeAtual = items.reduce(
      (acc: number, item: any) => acc + item.quantidadeAtual,
      0
    );

    const totalValorAtual = items.reduce(
      (acc: number, item: any) => acc + item.valorAtual,
      0
    );

    return NextResponse.json({
      ok: true,
      source: "SANCO / Escalasoft",
      endpoint: "/armazem/ordem/estoqueMercadoria",
      count: items.length,
      totalQuantidadeDisponivel,
      totalQuantidadeAtual,
      totalValorAtual,
      sample: items.slice(0, 5),
      items,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro inesperado ao consultar SANCO.",
      },
      { status: 500 }
    );
  }
}