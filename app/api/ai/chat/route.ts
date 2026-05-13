import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY não configurada." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const question = body.question || "";
    const context = body.context || {};

    if (!question.trim()) {
      return NextResponse.json(
        { error: "Pergunta vazia." },
        { status: 400 }
      );
    }

    const response = await client.responses.create({
      model: "gpt-5.5",
      input: [
        {
          role: "system",
          content:
            "Você é um copiloto operacional de estoque, compras e caixa da STL. Responda em português do Brasil, de forma objetiva, usando somente os dados fornecidos no contexto. Use apenas os dados recebidos no contexto. Se não houver dados suficientes, diga claramente o que falta.",
        },
        {
          role: "user",
          content: `
Pergunta do usuário:
${question}

Contexto do sistema em JSON:
${JSON.stringify(context, null, 2)}
          `,
        },
      ],
    });

    return NextResponse.json({
      answer: response.output_text || "Sem resposta.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Erro ao consultar IA.",
      },
      { status: 500 }
    );
  }
}