export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alimentos_taco: {
        Row: {
          calcio_mg: number | null
          carboidrato_g: number | null
          categoria: string
          ferro_mg: number | null
          fibra_g: number | null
          id: number
          kcal: number | null
          lipideos_g: number | null
          nome: string
          proteina_g: number | null
          sodio_mg: number | null
        }
        Insert: {
          calcio_mg?: number | null
          carboidrato_g?: number | null
          categoria: string
          ferro_mg?: number | null
          fibra_g?: number | null
          id: number
          kcal?: number | null
          lipideos_g?: number | null
          nome: string
          proteina_g?: number | null
          sodio_mg?: number | null
        }
        Update: {
          calcio_mg?: number | null
          carboidrato_g?: number | null
          categoria?: string
          ferro_mg?: number | null
          fibra_g?: number | null
          id?: number
          kcal?: number | null
          lipideos_g?: number | null
          nome?: string
          proteina_g?: number | null
          sodio_mg?: number | null
        }
        Relationships: []
      }
      anamnese: {
        Row: {
          alergias: string
          cirurgias: string
          client_id: string
          condicoes_medicas: string
          historico_familiar: string
          lesoes_dores: string
          medicamentos: string
          nivel_atividade: string
          objetivo_principal: string
          observacoes: string
          respostas_completas: Json | null
          restricoes_alimentares: string
          updated_at: string
        }
        Insert: {
          alergias?: string
          cirurgias?: string
          client_id: string
          condicoes_medicas?: string
          historico_familiar?: string
          lesoes_dores?: string
          medicamentos?: string
          nivel_atividade?: string
          objetivo_principal?: string
          observacoes?: string
          respostas_completas?: Json | null
          restricoes_alimentares?: string
          updated_at?: string
        }
        Update: {
          alergias?: string
          cirurgias?: string
          client_id?: string
          condicoes_medicas?: string
          historico_familiar?: string
          lesoes_dores?: string
          medicamentos?: string
          nivel_atividade?: string
          objetivo_principal?: string
          observacoes?: string
          respostas_completas?: Json | null
          restricoes_alimentares?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "anamnese_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos_paciente: {
        Row: {
          categoria: string
          client_id: string
          created_at: string
          id: string
          nome_arquivo: string
          observacao: string | null
          professional_id: string
          storage_path: string
          subscription_id: string
        }
        Insert: {
          categoria?: string
          client_id: string
          created_at?: string
          id?: string
          nome_arquivo: string
          observacao?: string | null
          professional_id: string
          storage_path: string
          subscription_id: string
        }
        Update: {
          categoria?: string
          client_id?: string
          created_at?: string
          id?: string
          nome_arquivo?: string
          observacao?: string | null
          professional_id?: string
          storage_path?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anexos_paciente_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_paciente_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anexos_paciente_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos: {
        Row: {
          client_id: string | null
          created_at: string
          data_atendimento: string
          id: string
          lead_id: string | null
          notas: string | null
          professional_id: string
          teleconsulta_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          data_atendimento?: string
          id?: string
          lead_id?: string | null
          notas?: string | null
          professional_id: string
          teleconsulta_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          data_atendimento?: string
          id?: string
          lead_id?: string | null
          notas?: string | null
          professional_id?: string
          teleconsulta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_teleconsulta_id_fkey"
            columns: ["teleconsulta_id"]
            isOneToOne: false
            referencedRelation: "teleconsultas"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          client_id: string
          created_at: string
          foto_costas_path: string | null
          foto_frente_path: string | null
          foto_perfil_direito_path: string | null
          foto_perfil_esquerdo_path: string | null
          id: string
          pontuacao_categorias: Json
          pontuacao_geral: number | null
          professional_id: string
          respostas: Json
          subscription_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          foto_costas_path?: string | null
          foto_frente_path?: string | null
          foto_perfil_direito_path?: string | null
          foto_perfil_esquerdo_path?: string | null
          id?: string
          pontuacao_categorias?: Json
          pontuacao_geral?: number | null
          professional_id: string
          respostas?: Json
          subscription_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          foto_costas_path?: string | null
          foto_frente_path?: string | null
          foto_perfil_direito_path?: string | null
          foto_perfil_esquerdo_path?: string | null
          id?: string
          pontuacao_categorias?: Json
          pontuacao_geral?: number | null
          professional_id?: string
          respostas?: Json
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_eventos: {
        Row: {
          cobranca_id: string
          created_at: string
          evento: string
          id: string
          payload: Json
        }
        Insert: {
          cobranca_id: string
          created_at?: string
          evento: string
          id?: string
          payload: Json
        }
        Update: {
          cobranca_id?: string
          created_at?: string
          evento?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_eventos_cobranca_id_fkey"
            columns: ["cobranca_id"]
            isOneToOne: false
            referencedRelation: "cobrancas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobrancas: {
        Row: {
          ciclo_referencia: string | null
          created_at: string
          gateway_charge_id: string
          id: string
          professional_id: string | null
          status: string
          subscription_id: string | null
          tipo: string
          updated_at: string
          valor_centavos: number
        }
        Insert: {
          ciclo_referencia?: string | null
          created_at?: string
          gateway_charge_id: string
          id?: string
          professional_id?: string | null
          status?: string
          subscription_id?: string | null
          tipo: string
          updated_at?: string
          valor_centavos: number
        }
        Update: {
          ciclo_referencia?: string | null
          created_at?: string
          gateway_charge_id?: string
          id?: string
          professional_id?: string | null
          status?: string
          subscription_id?: string | null
          tipo?: string
          updated_at?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobrancas_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      convites: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          lead_id: string | null
          nome: string
          plan_id: string | null
          respondido_em: string | null
          respostas: Json | null
          status: string
          token: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          lead_id?: string | null
          nome?: string
          plan_id?: string | null
          respondido_em?: string | null
          respostas?: Json | null
          status?: string
          token?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          lead_id?: string | null
          nome?: string
          plan_id?: string | null
          respondido_em?: string | null
          respostas?: Json | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "professional_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      exercicios_ilustracoes: {
        Row: {
          atualizado_em: string
          criado_em: string
          modelo: string | null
          nome_normalizado: string
          status: string
          storage_path: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          modelo?: string | null
          nome_normalizado: string
          status: string
          storage_path?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          modelo?: string | null
          nome_normalizado?: string
          status?: string
          storage_path?: string | null
        }
        Relationships: []
      }
      ia_geracoes: {
        Row: {
          client_id: string
          created_at: string
          erro: string | null
          id: string
          input_tokens: number | null
          modelo: string
          output_tokens: number | null
          professional_id: string
          status: string
          tipo: string
        }
        Insert: {
          client_id: string
          created_at?: string
          erro?: string | null
          id?: string
          input_tokens?: number | null
          modelo: string
          output_tokens?: number | null
          professional_id: string
          status: string
          tipo: string
        }
        Update: {
          client_id?: string
          created_at?: string
          erro?: string | null
          id?: string
          input_tokens?: number | null
          modelo?: string
          output_tokens?: number | null
          professional_id?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_geracoes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_geracoes_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          client_id: string | null
          convite_id: string | null
          created_at: string
          data_retomada: string | null
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          professional_id: string
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          convite_id?: string | null
          created_at?: string
          data_retomada?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          professional_id: string
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          convite_id?: string | null
          created_at?: string
          data_retomada?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          professional_id?: string
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_convite_id_fkey"
            columns: ["convite_id"]
            isOneToOne: false
            referencedRelation: "convites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_alimentares: {
        Row: {
          client_id: string
          fator_atividade: number | null
          formula_calculo: string | null
          gerado_por_ia: boolean
          get_calculado: number | null
          id: string
          meta_carboidrato_g: number | null
          meta_gordura_g: number | null
          meta_kcal: number | null
          meta_proteina_g: number | null
          nutricionista: string
          observacoes: string
          percentual_gordura: number | null
          periodo: string
          professional_id: string
          publicado: boolean
          refeicoes: Json
          tmb_calculada: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          fator_atividade?: number | null
          formula_calculo?: string | null
          gerado_por_ia?: boolean
          get_calculado?: number | null
          id?: string
          meta_carboidrato_g?: number | null
          meta_gordura_g?: number | null
          meta_kcal?: number | null
          meta_proteina_g?: number | null
          nutricionista?: string
          observacoes?: string
          percentual_gordura?: number | null
          periodo?: string
          professional_id: string
          publicado?: boolean
          refeicoes?: Json
          tmb_calculada?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          fator_atividade?: number | null
          formula_calculo?: string | null
          gerado_por_ia?: boolean
          get_calculado?: number | null
          id?: string
          meta_carboidrato_g?: number | null
          meta_gordura_g?: number | null
          meta_kcal?: number | null
          meta_proteina_g?: number | null
          nutricionista?: string
          observacoes?: string
          percentual_gordura?: number | null
          periodo?: string
          professional_id?: string
          publicado?: boolean
          refeicoes?: Json
          tmb_calculada?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planos_alimentares_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planos_alimentares_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          client_id: string
          dias: Json
          gerado_por_ia: boolean
          id: string
          periodo: string
          professional_id: string
          publicado: boolean
          treinador: string
          updated_at: string
        }
        Insert: {
          client_id: string
          dias?: Json
          gerado_por_ia?: boolean
          id?: string
          periodo?: string
          professional_id: string
          publicado?: boolean
          treinador?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          dias?: Json
          gerado_por_ia?: boolean
          id?: string
          periodo?: string
          professional_id?: string
          publicado?: boolean
          treinador?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_plans: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          inclui_dieta: boolean
          inclui_treino: boolean
          nome: string
          periodicidade: string
          preco_centavos: number | null
          professional_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          inclui_dieta?: boolean
          inclui_treino?: boolean
          nome: string
          periodicidade?: string
          preco_centavos?: number | null
          professional_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          inclui_dieta?: boolean
          inclui_treino?: boolean
          nome?: string
          periodicidade?: string
          preco_centavos?: number | null
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_plans_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_verificacoes: {
        Row: {
          bio: string | null
          cpf: string | null
          created_at: string
          documento_path: string | null
          id: string
          motivo_rejeicao: string | null
          numero_registro: string
          professional_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          uf_registro: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          cpf?: string | null
          created_at?: string
          documento_path?: string | null
          id?: string
          motivo_rejeicao?: string | null
          numero_registro: string
          professional_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uf_registro: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          cpf?: string | null
          created_at?: string
          documento_path?: string | null
          id?: string
          motivo_rejeicao?: string | null
          numero_registro?: string
          professional_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          uf_registro?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_verificacoes_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_verificacoes_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          asaas_subconta_id: string | null
          billing_status: string
          created_at: string
          especialidade: string
          id: string
        }
        Insert: {
          asaas_subconta_id?: string | null
          billing_status?: string
          created_at?: string
          especialidade?: string
          id: string
        }
        Update: {
          asaas_subconta_id?: string | null
          billing_status?: string
          created_at?: string
          especialidade?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professionals_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          altura_cm: number | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          id: string
          is_admin: boolean
          nome: string
          peso_kg: number | null
          role: string
          sexo: string | null
          telefone: string | null
        }
        Insert: {
          altura_cm?: number | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id: string
          is_admin?: boolean
          nome?: string
          peso_kg?: number | null
          role?: string
          sexo?: string | null
          telefone?: string | null
        }
        Update: {
          altura_cm?: number | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          is_admin?: boolean
          nome?: string
          peso_kg?: number | null
          role?: string
          sexo?: string | null
          telefone?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_status: string
          created_at: string
          current_period_end: string | null
          id: string
          patient_id: string
          plan_id: string | null
          plano_solicitado_id: string | null
          professional_id: string
          started_at: string
          status: string
        }
        Insert: {
          billing_status?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          patient_id: string
          plan_id?: string | null
          plano_solicitado_id?: string | null
          professional_id: string
          started_at?: string
          status?: string
        }
        Update: {
          billing_status?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          patient_id?: string
          plan_id?: string | null
          plano_solicitado_id?: string | null
          professional_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "professional_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plano_solicitado_id_fkey"
            columns: ["plano_solicitado_id"]
            isOneToOne: false
            referencedRelation: "professional_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      teleconsultas: {
        Row: {
          created_at: string
          data_hora: string
          id: string
          link_meet: string
          observacoes: string
          patient_id: string
          professional_id: string
          status: string
        }
        Insert: {
          created_at?: string
          data_hora: string
          id?: string
          link_meet: string
          observacoes?: string
          patient_id: string
          professional_id: string
          status?: string
        }
        Update: {
          created_at?: string
          data_hora?: string
          id?: string
          link_meet?: string
          observacoes?: string
          patient_id?: string
          professional_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "teleconsultas_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teleconsultas_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_drafts: {
        Row: {
          client_id: string
          exercise_id: string
          session_date: string
          sets: Json
          updated_at: string
        }
        Insert: {
          client_id: string
          exercise_id: string
          session_date: string
          sets?: Json
          updated_at?: string
        }
        Update: {
          client_id?: string
          exercise_id?: string
          session_date?: string
          sets?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_drafts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          client_id: string
          created_at: string
          exercise_id: string
          id: string
          session_date: string
          sets: Json
        }
        Insert: {
          client_id: string
          created_at?: string
          exercise_id: string
          id?: string
          session_date: string
          sets: Json
        }
        Update: {
          client_id?: string
          created_at?: string
          exercise_id?: string
          id?: string
          session_date?: string
          sets?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cadastrar_profissional: {
        Args: {
          p_bio?: string
          p_cpf: string
          p_documento_path: string
          p_especialidade: string
          p_nome: string
          p_numero_registro: string
          p_uf_registro: string
        }
        Returns: boolean
      }
      finalizar_cadastro_convite: {
        Args: { p_token: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_client_of: { Args: { p_professional_id: string }; Returns: boolean }
      is_professional: { Args: never; Returns: boolean }
      is_professional_of: { Args: { p_patient_id: string }; Returns: boolean }
      is_trainer: { Args: never; Returns: boolean }
      obter_convite: {
        Args: { p_token: string }
        Returns: {
          conta_existe: boolean
          email: string
          nome: string
          status: string
        }[]
      }
      obter_selo_profissionais: {
        Args: { p_professional_ids: string[] }
        Returns: {
          bio: string
          professional_id: string
          verificado: boolean
        }[]
      }
      obter_solicitacoes_pendentes: {
        Args: never
        Returns: {
          created_at: string
          especialidade: string
          profissional_nome: string
          token: string
        }[]
      }
      pode_ler_anexo_paciente: { Args: { p_caminho: string }; Returns: boolean }
      pode_ler_foto_checkin: { Args: { p_caminho: string }; Returns: boolean }
      recusar_convite: { Args: { p_token: string }; Returns: boolean }
      reenviar_convite: { Args: { p_convite_id: string }; Returns: string }
      submeter_anamnese: {
        Args: { p_respostas: Json; p_token: string }
        Returns: boolean
      }
      submeter_anamnese_autenticado: {
        Args: { p_plano_id?: string; p_respostas: Json }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
