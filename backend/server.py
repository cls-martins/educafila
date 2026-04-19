from fastapi import FastAPI, APIRouter, Header, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

SERVICE_HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

# Create the main app without a prefix
app = FastAPI(title="EducaFila Admin API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ===================== Models =====================
class StaffCreate(BaseModel):
    full_name: str = Field(..., min_length=2)
    email: EmailStr
    password: Optional[str] = None  # if None, derived from name
    school_id: str
    role: str  # 'professor' or 'gestao'


class StudentCreate(BaseModel):
    full_name: str = Field(..., min_length=2)
    email: EmailStr
    password: Optional[str] = None
    school_id: str
    classroom_id: str
    gender: Optional[str] = None  # 'masculino' | 'feminino' | 'outro' | None
    year: Optional[int] = None


class BulkStudentsCreate(BaseModel):
    school_id: str
    classroom_id: str
    year: Optional[int] = None
    students: list  # list of {full_name, email, gender?}


# ===================== Helpers =====================
def generate_password(name: str) -> str:
    """Match frontend scheme: lowercase, replace spaces with '.', strip accents, suffix @edu2026."""
    import unicodedata
    clean = name.lower().replace(" ", ".")
    clean = "".join(c for c in unicodedata.normalize("NFD", clean) if unicodedata.category(c) != "Mn")
    return f"{clean}@edu2026"


async def verify_super_admin(authorization: Optional[str]) -> str:
    """Validate Bearer JWT via Supabase Auth, then confirm role == super_admin via service role.

    Returns the admin user_id on success, raises HTTPException otherwise.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer token ausente")
    token = authorization.split(" ", 1)[1].strip()

    async with httpx.AsyncClient(timeout=15) as client:
        # Validate token and get user
        r = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Token inválido ou expirado")
        user = r.json()
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Usuário não encontrado no token")

        # Check role via service_role
        r2 = await client.get(
            f"{SUPABASE_URL}/rest/v1/user_roles?user_id=eq.{user_id}&select=role",
            headers=SERVICE_HEADERS,
        )
        if r2.status_code != 200:
            raise HTTPException(status_code=500, detail="Falha ao ler roles")
        roles = [row["role"] for row in r2.json()]
        if "super_admin" not in roles:
            raise HTTPException(status_code=403, detail="Acesso restrito a super_admin")
    return user_id


async def _admin_create_auth_user(email: str, password: str, full_name: str) -> str:
    """Create Supabase auth user with email already confirmed. Returns user id."""
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers=SERVICE_HEADERS,
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            },
        )
        if r.status_code not in (200, 201):
            # Supabase returns details like "A user with this email address has already been registered"
            detail = r.text
            try:
                j = r.json()
                detail = j.get("msg") or j.get("message") or j.get("error_description") or detail
            except Exception:
                pass
            raise HTTPException(status_code=400, detail=f"Erro ao criar usuário: {detail}")
        data = r.json()
        user_id = data.get("id") or data.get("user", {}).get("id")
        if not user_id:
            raise HTTPException(status_code=500, detail="Resposta do Supabase sem user id")
        return user_id


async def _insert_rows(table: str, rows: list):
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={**SERVICE_HEADERS, "Prefer": "return=representation"},
            json=rows,
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Erro ao inserir em {table}: {r.text}")
        return r.json()


# ===================== Endpoints =====================
@api_router.get("/")
async def root():
    return {"message": "EducaFila Admin API OK"}


@api_router.get("/health")
async def health():
    return {"status": "ok", "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)}


@api_router.post("/admin/staff")
async def create_staff(body: StaffCreate, authorization: Optional[str] = Header(None)):
    """Create a professor or gestão user, fully provisioned."""
    await verify_super_admin(authorization)
    if body.role not in ("professor", "gestao"):
        raise HTTPException(status_code=400, detail="role deve ser 'professor' ou 'gestao'")

    password = body.password or generate_password(body.full_name)
    email = body.email.lower().strip()

    user_id = await _admin_create_auth_user(email, password, body.full_name)
    try:
        await _insert_rows("profiles", [{
            "user_id": user_id,
            "full_name": body.full_name,
            "email": email,
            "school_id": body.school_id,
            "is_active": True,
        }])
        await _insert_rows("user_roles", [{"user_id": user_id, "role": body.role}])
        if body.role == "professor":
            await _insert_rows("teacher_schools", [{"user_id": user_id, "school_id": body.school_id}])
    except HTTPException:
        # Best-effort rollback on auth user creation
        async with httpx.AsyncClient(timeout=15) as client:
            await client.delete(
                f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers=SERVICE_HEADERS,
            )
        raise
    return {"user_id": user_id, "password": password, "email": email}


@api_router.post("/admin/student")
async def create_student(body: StudentCreate, authorization: Optional[str] = Header(None)):
    """Create a single student user, fully provisioned."""
    await verify_super_admin(authorization)
    logger.info(f"create_student: email={body.email} school={body.school_id} classroom={body.classroom_id}")

    password = body.password or generate_password(body.full_name)
    email = body.email.lower().strip()

    user_id = await _admin_create_auth_user(email, password, body.full_name)
    try:
        await _insert_rows("profiles", [{
            "user_id": user_id,
            "full_name": body.full_name,
            "email": email,
            "school_id": body.school_id,
            "classroom_id": body.classroom_id,
            "gender": body.gender,
            "year": body.year,
            "is_active": True,
        }])
        await _insert_rows("user_roles", [{"user_id": user_id, "role": "aluno"}])
    except HTTPException as he:
        logger.error(f"create_student rollback for {email}: {he.detail}")
        async with httpx.AsyncClient(timeout=15) as client:
            await client.delete(
                f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers=SERVICE_HEADERS,
            )
        raise
    logger.info(f"create_student OK: {email} -> user_id {user_id}")
    return {"user_id": user_id, "password": password, "email": email}


@api_router.post("/admin/students/bulk")
async def bulk_students(body: BulkStudentsCreate, authorization: Optional[str] = Header(None)):
    """Bulk create students from a parsed list. Continues on error per-row."""
    await verify_super_admin(authorization)

    results = {"success": [], "errors": []}
    for idx, s in enumerate(body.students):
        try:
            full_name = (s.get("full_name") or s.get("nome") or s.get("name") or "").strip()
            email = (s.get("email") or "").strip().lower()
            gender = s.get("gender") or s.get("genero") or None
            if not full_name or not email:
                results["errors"].append({"row": idx, "reason": "nome ou email ausente"})
                continue
            password = generate_password(full_name)
            user_id = await _admin_create_auth_user(email, password, full_name)
            try:
                await _insert_rows("profiles", [{
                    "user_id": user_id,
                    "full_name": full_name,
                    "email": email,
                    "school_id": body.school_id,
                    "classroom_id": body.classroom_id,
                    "gender": gender,
                    "year": body.year,
                    "is_active": True,
                }])
                await _insert_rows("user_roles", [{"user_id": user_id, "role": "aluno"}])
                results["success"].append({"email": email, "password": password})
            except HTTPException as he:
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.delete(
                        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                        headers=SERVICE_HEADERS,
                    )
                results["errors"].append({"row": idx, "email": email, "reason": str(he.detail)})
        except HTTPException as he:
            results["errors"].append({"row": idx, "reason": str(he.detail)})
        except Exception as e:
            results["errors"].append({"row": idx, "reason": str(e)})
    return results


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
