#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  EducaFila (Supabase + Vite/React) — continuação de projeto Lovable:
  7. Alunos podem colocar foto de perfil e EXIBIR a foto na fila
  8. Professores + líder + vice-líder podem dividir a fila em 2 colunas
     (feminina/masculina); alunos veem a divisão automaticamente

frontend:
  - task: "Fix 1: AuthContext race condition (login 2x)"
    implemented: true
    working: "NA"
    file: "frontend/src/contexts/AuthContext.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Fix 2: Staff register + query (session preserve, !inner)"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/SuperAdminDashboard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Fix 3: Remove @prof.ce.gov.br requirement"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/LoginPage.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
  - task: "Fix 4: Enforce tab→role mapping on login"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/LoginPage.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Fix 5: Courses tab + auto-generate 1°/2°/3° classrooms"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/SuperAdminDashboard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
  - task: "Fix 6: Remove Novos tab"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/SuperAdminDashboard.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: true
  - task: "Feature 7: Show student avatar in queue (QueueItemRow)"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/StudentDashboard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Build estava quebrado — QueueItemRow era referenciado mas não existia + <section> duplicada. Criado QueueItemRow com avatar (img do profiles.avatar_url com fallback para inicial do nome), nome colorido, badge de líder, status e botões de líder (penalidade/remover). Upload já existia no ProfileDialog (bucket 'avatars')."
  - task: "Feature 8: Teacher can split queue by gender"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/TeacherDashboard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "TeacherDashboard reescrito. Adicionado botão 'Dividir por gênero/Unificar fila' no header da card da fila. Fetch + realtime UPDATE em classrooms.split_queue_by_gender. Quando ativado, render em 2 colunas (Feminino rosa / Masculino azul) + seção 'Sem gênero definido' se houver. Avatares exibidos em todas as linhas. Alunos veem a divisão via realtime (já implementado em StudentDashboard)."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Feature 7: Show student avatar in queue (QueueItemRow)"
    - "Feature 8: Teacher can split queue by gender"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Implementing 6 frontend fixes on existing Supabase app. No backend changes. Will require manual/UI testing after implementation."
  - agent: "main"
    message: |
      Continuação do projeto Lovable (créditos expiraram no meio). Infra Supabase
      já pronta (colunas avatar_url, gender, split_queue_by_gender, bucket
      avatars, RLS). Corrigido BUILD QUEBRADO (QueueItemRow faltando + section
      duplicada) e adicionado:
      - StudentDashboard: QueueItemRow novo com avatar redondo + fallback de
        inicial, nome colorido, badge líder, status, ações do líder.
      - TeacherDashboard: botão 'Dividir por gênero' (persiste em
        classrooms.split_queue_by_gender) + render em 2 colunas
        (Feminino rosa / Masculino azul) + avatares.
      yarn build OK. Aguardando usuário: (a) testar manualmente com conta real
      no Vercel/preview OU (b) passar credenciais de teste para acionar o
      frontend agent.