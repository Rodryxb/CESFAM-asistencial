# Sistema Web de Gestión para Farmacia Asistencial (CESFAM)
**Proyecto Integrado AP-N4-C1 | Autor: Rodrigo Bastián Castro Sandoval**

Base arquitectónica completa (**Django REST Framework + PostgreSQL Híbrido SQL/JSONB-GIN + React/TypeScript**) diseñada para una Farmacia Asistencial perteneciente a la Red Pública de Atención Primaria de Salud (APS - MINSAL).

---

## 1. Estructura del Proyecto

```text
CESFAM_Farmacia/
├── backend/                              # API Backend Django + Django REST Framework
│   ├── cesfam_project/                   # Configuración central, Seguridad OWASP y conexión PostgreSQL
│   ├── core/
│   │   ├── models.py                     # Esquema Híbrido: 17 tablas SQL Relacionales + 2 tablas JSONB con GinIndex
│   │   ├── validators.py                 # Validador chileno de RUT (Algoritmo Módulo 11) y cifrado Ley 19.628
│   │   ├── services/
│   │   │   ├── fefo_service.py           # Motor FEFO automático, bloqueo de lotes vencidos y Libro Controlado ISP
│   │   │   ├── demand_prediction_service.py # Algoritmo Predicción de Demanda a 90 días y sugerencia CENABAST
│   │   │   ├── audit_dag_service.py      # Cadena de custodia inmutable SHA-256 bajo norma ALCOA+ ISP
│   │   │   └── hl7_fhir_service.py       # Bus de interoperabilidad HL7 FHIR R4 (Patient, Coverage, MedicationRequest)
│   │   ├── serializers.py                # Serializadores DRF estructurados y documentales JSONB
│   │   ├── views.py                      # Endpoints RESTful y acciones transaccionales
│   │   ├── permissions.py                # Control de acceso RBAC (Admin, Q.F., Técnico, Clínico)
│   │   └── tests.py                      # Suite de pruebas unitarias e integrales automatizadas
│   ├── seed_cesfam.py                    # Semilla de datos reales CESFAM (medicamentos, lotes semáforo, pacientes GES)
│   └── manage.py
├── database/
│   ├── schema_postgresql.sql             # Script DDL nativo PostgreSQL 18 (PK/FK, CHECK, JSONB, GIN Indexes y Triggers)
│   └── ARQUITECTURA_DATOS_HIBRIDA.md     # Diagrama Entidad-Relación y justificación Criterios 2.1.4.8 y 2.1.4.9
└── frontend/                             # Aplicación Frontend React 18 + TypeScript + Vite
    ├── src/
    │   ├── types/cesfam.ts               # Tipado fuerte de entidades estructuradas y recursos JSONB/FHIR
    │   ├── utils/rutModulo11.ts          # Validador Módulo 11 en TypeScript
    │   ├── services/cesfamApi.ts         # Cliente HTTP hacia Django REST Framework
    │   ├── components/NavbarInstitucional.tsx
    │   └── pages/DashboardOperacional.tsx
    ├── package.json
    └── tsconfig.json
```

---

## 2. Ejecución Rápida y Verificación

```powershell
# 1. Aplicar migraciones de base de datos
cd backend
python manage.py migrate

# 2. Poblar semilla institucional CESFAM (Medicamentos reales, lotes Verde/Amarillo/Rojo, Pacientes GES/Crónicos)
python seed_cesfam.py

# 3. Ejecutar suite completa de pruebas unitarias e integrales
python manage.py test -v 2
```
