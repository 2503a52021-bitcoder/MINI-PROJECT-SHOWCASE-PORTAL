/**
 * ==========================================================================
 * Project Showcase Portal - script.js
 * Hackathon 2026 Edition
 * Full Backend Integration via Fetch API to Node.js/Express + MongoDB
 * ==========================================================================
 */

// 1. API CONFIGURATION
const API_BASE_URL = (window.location.port === '5000')
  ? ''
  : 'http://localhost:5000';

const AUTH_TOKEN_KEY = 'showcase_auth_token';
const AUTH_USER_KEY = 'showcase_auth_user';

// 2. APPLICATION STATE
const AppState = {
  currentUser: null,       // { id, name, email, role, batch }
  authToken: null,
  currentSection: 'dashboard',
  projects: [],            // Approved projects (for explore)
  myProjects: [],          // Student's projects
  pendingProjects: [],     // Faculty review projects
  stats: null,             // Aggregated statistics
  filters: {
    title: '',
    tech: '',
    category: 'ALL',
    batch: 'ALL'
  },
  studentTab: 'ALL',
  facultyTab: 'Pending',
  currentUploadedFile: null,
  authModalMode: 'login',  // 'login' or 'register'
  authModalRole: 'student' // 'student' or 'faculty'
};

// --------------------------------------------------------------------------
// 3. AUTHENTICATION & SESSION MANAGEMENT
// --------------------------------------------------------------------------

function initAuth() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const userJson = localStorage.getItem(AUTH_USER_KEY);

  if (token && userJson) {
    try {
      AppState.authToken = token;
      AppState.currentUser = JSON.parse(userJson);
    } catch (e) {
      clearSession();
    }
  } else {
    // Default initial guest student session
    AppState.currentUser = {
      id: 'default-student',
      name: 'Aarav Sharma',
      email: 'student@showcase.edu',
      role: 'student',
      batch: '2022-2026'
    };
  }

  updateAuthUI();
}

function setSession(user, token) {
  AppState.currentUser = user;
  AppState.authToken = token;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  updateAuthUI();
}

function clearSession() {
  AppState.currentUser = {
    id: 'guest',
    name: 'Guest Student',
    email: 'guest@showcase.edu',
    role: 'student',
    batch: '2023-2027'
  };
  AppState.authToken = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  updateAuthUI();
}

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (AppState.authToken) {
    headers['Authorization'] = `Bearer ${AppState.authToken}`;
  }
  return headers;
}

function updateAuthUI() {
  const user = AppState.currentUser || {};
  const isFaculty = user.role === 'faculty';

  // Sidebar role pill
  const sidebarRolePill = document.getElementById('sidebar-role-text');
  if (sidebarRolePill) {
    sidebarRolePill.textContent = isFaculty ? 'Faculty Reviewer' : 'Student View';
  }

  // Header role switcher button
  const roleSwitchText = document.getElementById('role-switch-text');
  if (roleSwitchText) {
    roleSwitchText.textContent = isFaculty ? 'Switch to Student' : 'Switch to Faculty';
  }

  // Profile avatar and info
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileRoleLabel = document.getElementById('profile-role-label');

  if (profileAvatar) {
    const initials = user.name
      ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
      : (isFaculty ? 'DR' : 'ST');
    profileAvatar.textContent = initials;
  }
  if (profileName) profileName.textContent = user.name || 'User';
  if (profileRoleLabel) {
    profileRoleLabel.textContent = isFaculty ? 'Faculty Evaluator' : 'Student';
  }

  // Faculty Review Sidebar Nav Link: Strictly show ONLY if faculty
  const navItemFaculty = document.getElementById('nav-item-faculty');
  if (navItemFaculty) {
    if (isFaculty) {
      navItemFaculty.classList.remove('hidden');
    } else {
      navItemFaculty.classList.add('hidden');
      if (AppState.currentSection === 'faculty-review') {
        navigateToSection('dashboard');
      }
    }
  }
}

// --------------------------------------------------------------------------
// 4. API FETCH WRAPPERS (MONGODB BACKEND)
// --------------------------------------------------------------------------

/**
 * Fetch approved projects with search and filters from MongoDB
 */
async function apiFetchProjects() {
  try {
    const params = new URLSearchParams();
    if (AppState.filters.title) params.append('search', AppState.filters.title);
    if (AppState.filters.tech) params.append('tech', AppState.filters.tech);
    if (AppState.filters.category && AppState.filters.category !== 'ALL') {
      params.append('category', AppState.filters.category);
    }
    if (AppState.filters.batch && AppState.filters.batch !== 'ALL') {
      params.append('batch', AppState.filters.batch);
    }
    params.append('status', 'Approved');

    const response = await fetch(`${API_BASE_URL}/api/projects?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to load projects');
    const result = await response.json();
    AppState.projects = result.data || [];
    return AppState.projects;
  } catch (err) {
    console.warn('[API Warning] Could not fetch projects:', err.message);
    return [];
  }
}

/**
 * Fetch dynamic statistics directly aggregated from MongoDB
 */
async function apiFetchStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects/stats`);
    if (!response.ok) throw new Error('Failed to fetch statistics');
    const result = await response.json();
    AppState.stats = result.data;
    return AppState.stats;
  } catch (err) {
    console.warn('[API Warning] Could not fetch stats:', err.message);
    return null;
  }
}

/**
 * Fetch student's own projects from MongoDB
 */
async function apiFetchMyProjects() {
  try {
    let url = `${API_BASE_URL}/api/projects/my`;
    let headers = getAuthHeaders();

    // If unauthenticated guest, fetch by studentName query
    if (!AppState.authToken) {
      const studentName = AppState.currentUser ? AppState.currentUser.name : 'Aarav Sharma';
      url = `${API_BASE_URL}/api/projects?search=${encodeURIComponent(studentName)}`;
      headers = {};
    }

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error('Failed to fetch your projects');
    const result = await response.json();
    AppState.myProjects = result.data || [];
    return AppState.myProjects;
  } catch (err) {
    console.warn('[API Warning] Could not fetch my projects:', err.message);
    return [];
  }
}

/**
 * Fetch pending project submissions for faculty review from MongoDB
 */
async function apiFetchFacultySubmissions() {
  try {
    const statusParam = AppState.facultyTab !== 'ALL' ? `?status=${AppState.facultyTab}` : '';
    const response = await fetch(`${API_BASE_URL}/api/faculty/pending${statusParam}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      // Fallback to query
      const fallbackRes = await fetch(`${API_BASE_URL}/api/projects${statusParam ? statusParam : '?status=Pending'}`);
      const fallbackResult = await fallbackRes.json();
      AppState.pendingProjects = fallbackResult.data || [];
      return AppState.pendingProjects;
    }

    const result = await response.json();
    AppState.pendingProjects = result.data || [];
    return AppState.pendingProjects;
  } catch (err) {
    console.warn('[API Warning] Could not fetch faculty submissions:', err.message);
    return [];
  }
}

// --------------------------------------------------------------------------
// 5. NAVIGATION & SECTION ROUTING
// --------------------------------------------------------------------------

function navigateToSection(sectionId) {
  if (sectionId === 'faculty-review' && AppState.currentUser?.role !== 'faculty') {
    showToast('Faculty Review is restricted to Faculty Evaluators.', 'error');
    openAuthModal('faculty');
    return;
  }

  AppState.currentSection = sectionId;

  // Sidebar link active state
  document.querySelectorAll('.nav-link').forEach(btn => {
    if (btn.getAttribute('data-target') === sectionId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Switch visible section
  document.querySelectorAll('.section-view').forEach(sec => {
    if (sec.id === `${sectionId}-view`) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });

  // Close mobile sidebar
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Trigger view renderers
  if (sectionId === 'dashboard') {
    renderDashboard();
  } else if (sectionId === 'explore') {
    renderExploreProjects();
  } else if (sectionId === 'my-projects') {
    renderMyProjects();
  } else if (sectionId === 'faculty-review') {
    renderFacultyReview();
  } else if (sectionId === 'analytics') {
    renderAnalytics();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --------------------------------------------------------------------------
// 6. STATISTICS RENDERING
// --------------------------------------------------------------------------

async function updateStatistics() {
  const stats = await apiFetchStats();
  if (!stats) return;

  const totalEl = document.getElementById('stat-total-projects');
  const approvedEl = document.getElementById('stat-approved-projects');
  const pendingEl = document.getElementById('stat-pending-projects');
  const studentsEl = document.getElementById('stat-total-students');
  const approvalRateEl = document.getElementById('stat-approval-rate');
  const facultyBadge = document.getElementById('faculty-pending-badge');
  const facultyStatPending = document.getElementById('faculty-stat-pending');
  const facultyStatApproved = document.getElementById('faculty-stat-approved');
  const facultyStatRejected = document.getElementById('faculty-stat-rejected');

  if (totalEl) totalEl.textContent = stats.totalProjects;
  if (approvedEl) approvedEl.textContent = stats.approvedProjects;
  if (pendingEl) pendingEl.textContent = stats.pendingProjects;
  if (studentsEl) studentsEl.textContent = stats.totalStudents;
  if (approvalRateEl) approvalRateEl.textContent = `${stats.approvalRate}% verified`;

  if (facultyBadge) facultyBadge.textContent = stats.pendingProjects;
  if (facultyStatPending) facultyStatPending.textContent = stats.pendingProjects;
  if (facultyStatApproved) facultyStatApproved.textContent = stats.approvedProjects;
  if (facultyStatRejected) facultyStatRejected.textContent = stats.rejectedProjects;

  // Category view counts
  if (Array.isArray(stats.categoryStats)) {
    stats.categoryStats.forEach(cs => {
      const el = document.getElementById(`cat-count-${cs.category.toLowerCase()}`);
      if (el) el.textContent = `${cs.approved} Projects`;
    });
  }
}

// --------------------------------------------------------------------------
// 7. PROJECT CARD GENERATOR (REUSABLE TEMPLATE)
// --------------------------------------------------------------------------

function createProjectCardHTML(project, options = {}) {
  const isStudentView = options.isStudentView || false;

  const categoryIcons = {
    Web: '🌐',
    Mobile: '📱',
    AI: '🤖',
    IoT: '📡'
  };

  const catIcon = categoryIcons[project.category] || '💻';
  const catClass = `cat-${project.category ? project.category.toLowerCase() : 'web'}`;

  // Image or CSS Fallback
  let mediaHTML = '';
  const imgPath = project.screenshotPath || project.screenshot;
  if (imgPath && imgPath.trim() !== '') {
    const fullImgUrl = imgPath.startsWith('http') || imgPath.startsWith('data:')
      ? imgPath
      : `${API_BASE_URL}${imgPath}`;
    mediaHTML = `<img src="${fullImgUrl}" alt="${escapeHTML(project.title)}" class="card-img" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'card-thumbnail-fallback ${catClass}\\'><span class=\\'fallback-symbol\\'>${catIcon}</span><span class=\\'fallback-title\\'>${escapeHTML(project.category)} Showcase</span></div>';">`;
  } else {
    mediaHTML = `
      <div class="card-thumbnail-fallback ${catClass}">
        <span class="fallback-symbol">${catIcon}</span>
        <span class="fallback-title">${escapeHTML(project.category)} Showcase</span>
      </div>
    `;
  }

  const statusClass = (project.status || 'Pending').toLowerCase();
  const techBadges = (project.technologies || [])
    .slice(0, 4)
    .map(t => `<span class="tech-tag">${escapeHTML(t)}</span>`)
    .join('');

  const authorInitial = project.studentName ? project.studentName.charAt(0).toUpperCase() : 'S';
  const projId = project._id || project.projectId;

  let actionButtonsHTML = '';
  if (isStudentView) {
    const isPending = project.status === 'Pending';
    actionButtonsHTML = `
      <div class="card-actions">
        <button class="btn btn-secondary btn-sm" onclick="viewProjectDetails('${projId}')">View Details</button>
        <a href="${project.githubLink || project.githubUrl || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-github btn-sm">GitHub ↗</a>
      </div>
      <div class="student-card-actions">
        ${isPending ? `
          <button class="btn-icon-text" onclick="editProject('${projId}')" title="Edit project before approval">
            <span>✏️</span> Edit
          </button>
          <button class="btn-icon-text danger" onclick="deleteProject('${projId}')" title="Delete pending project">
            <span>🗑️</span> Delete
          </button>
        ` : `
          <span class="field-hint">${project.status === 'Approved' ? '🔒 Locked (Approved by Faculty)' : '⚠️ Rejected - Review feedback'}</span>
        `}
      </div>
    `;
  } else {
    actionButtonsHTML = `
      <div class="card-actions">
        <button class="btn btn-secondary btn-sm" onclick="viewProjectDetails('${projId}')">View Details</button>
        <a href="${project.githubLink || project.githubUrl || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-github btn-sm">GitHub ↗</a>
      </div>
    `;
  }

  return `
    <div class="project-card" data-id="${projId}">
      <div class="card-media">
        ${mediaHTML}
        <div class="card-badge-overlay">
          <span class="badge badge-purple">${escapeHTML(project.category)}</span>
        </div>
        <div class="card-status-overlay">
          <span class="status-badge ${statusClass}">${escapeHTML(project.status)}</span>
        </div>
      </div>
      <div class="card-content">
        <h4 class="card-title">${escapeHTML(project.title)}</h4>
        <p class="card-desc">${escapeHTML(project.description)}</p>
        
        <div class="card-tech-list">
          ${techBadges}
        </div>

        <div class="card-meta">
          <div class="author-info">
            <div class="author-avatar">${authorInitial}</div>
            <span class="author-name">${escapeHTML(project.studentName || 'Student')}</span>
          </div>
          <span class="batch-tag">${escapeHTML(project.batch || '2023-2027')}</span>
        </div>

        ${actionButtonsHTML}
      </div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// 8. SECTION RENDERERS
// --------------------------------------------------------------------------

// Dashboard View
async function renderDashboard() {
  const featuredGrid = document.getElementById('featured-projects-grid');
  if (!featuredGrid) return;

  await updateStatistics();
  const projects = await apiFetchProjects();
  const featured = projects.slice(0, 3);

  if (featured.length === 0) {
    featuredGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-icon">🌟</div>
        <h3>No Featured Projects Yet</h3>
        <p>Faculty will approve and highlight outstanding submissions shortly.</p>
      </div>
    `;
    return;
  }

  featuredGrid.innerHTML = featured.map(p => createProjectCardHTML(p)).join('');
}

// Explore Projects View
async function renderExploreProjects() {
  const grid = document.getElementById('explore-projects-grid');
  const emptyState = document.getElementById('explore-empty-state');
  const counterEl = document.getElementById('explore-counter');
  if (!grid) return;

  grid.innerHTML = '<div style="padding: 20px; color: #64748b;">Loading verified projects from MongoDB...</div>';

  const projects = await apiFetchProjects();

  if (counterEl) {
    counterEl.textContent = `Showing ${projects.length} Approved Projects`;
  }

  if (projects.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
  } else {
    if (emptyState) emptyState.classList.add('hidden');
    grid.innerHTML = projects.map(p => createProjectCardHTML(p)).join('');
  }
}

// My Projects View (Student Dashboard)
async function renderMyProjects() {
  const grid = document.getElementById('my-projects-grid');
  const emptyState = document.getElementById('my-projects-empty');
  if (!grid) return;

  grid.innerHTML = '<div style="padding: 20px; color: #64748b;">Loading your submissions...</div>';

  const myProjects = await apiFetchMyProjects();

  const pendingCount = myProjects.filter(p => p.status === 'Pending').length;
  const approvedCount = myProjects.filter(p => p.status === 'Approved').length;
  const rejectedCount = myProjects.filter(p => p.status === 'Rejected').length;

  const tabAll = document.getElementById('tab-count-all');
  const tabPending = document.getElementById('tab-count-pending');
  const tabApproved = document.getElementById('tab-count-approved');
  const tabRejected = document.getElementById('tab-count-rejected');

  if (tabAll) tabAll.textContent = myProjects.length;
  if (tabPending) tabPending.textContent = pendingCount;
  if (tabApproved) tabApproved.textContent = approvedCount;
  if (tabRejected) tabRejected.textContent = rejectedCount;

  let filtered = myProjects;
  if (AppState.studentTab !== 'ALL') {
    filtered = filtered.filter(p => p.status === AppState.studentTab);
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
  } else {
    if (emptyState) emptyState.classList.add('hidden');
    grid.innerHTML = filtered.map(p => createProjectCardHTML(p, { isStudentView: true })).join('');
  }
}

// Faculty Review View
async function renderFacultyReview() {
  const container = document.getElementById('faculty-submissions-list');
  const emptyState = document.getElementById('faculty-empty-state');
  if (!container) return;

  container.innerHTML = '<div style="padding: 20px; color: #64748b;">Loading submissions for faculty evaluation...</div>';

  const submissions = await apiFetchFacultySubmissions();

  if (submissions.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = submissions.map(project => {
    const isPending = project.status === 'Pending';
    const statusClass = project.status.toLowerCase();
    const projId = project._id || project.projectId;

    return `
      <div class="faculty-review-card" data-id="${projId}">
        <div class="frc-top">
          <div class="frc-info">
            <h3>${escapeHTML(project.title)}</h3>
            <div class="frc-badges">
              <span class="badge badge-purple">${escapeHTML(project.category)}</span>
              <span class="status-badge ${statusClass}">${escapeHTML(project.status)}</span>
              <span class="batch-tag">${escapeHTML(project.batch)}</span>
            </div>
          </div>
          <div class="frc-actions">
            <button class="btn btn-secondary btn-sm" onclick="viewProjectDetails('${projId}')">
              <span>👁️</span> Full Review
            </button>
            <a href="${project.githubLink || project.githubUrl || '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-github btn-sm">
              <span>🔗</span> GitHub
            </a>
            ${isPending ? `
              <button class="btn btn-success btn-sm" onclick="approveProject('${projId}')">
                <span>✅</span> Approve
              </button>
              <button class="btn btn-danger btn-sm" onclick="rejectProject('${projId}')">
                <span>❌</span> Reject
              </button>
            ` : `
              ${project.status === 'Rejected' ? `
                <button class="btn btn-success btn-sm" onclick="approveProject('${projId}')">
                  <span>✅</span> Re-Approve
                </button>
              ` : `
                <button class="btn btn-danger btn-sm" onclick="rejectProject('${projId}')">
                  <span>❌</span> Revoke
                </button>
              `}
            `}
          </div>
        </div>

        <div class="frc-body">
          <p>${escapeHTML(project.description)}</p>
          ${project.facultyFeedback ? `
            <div style="margin-top: 10px; padding: 8px 12px; background: #fff1f2; border-left: 3px solid #ef4444; border-radius: 4px; font-size: 0.85rem;">
              <strong>Feedback:</strong> ${escapeHTML(project.facultyFeedback)}
            </div>
          ` : ''}
        </div>

        <div class="frc-meta-grid">
          <div class="frc-meta-item">
            <span class="label">Lead Student</span>
            <span class="val">${escapeHTML(project.studentName || 'Student')}</span>
          </div>
          <div class="frc-meta-item">
            <span class="label">Team Members</span>
            <span class="val">${(project.teamMembers || []).join(', ')}</span>
          </div>
          <div class="frc-meta-item">
            <span class="label">Technologies</span>
            <span class="val">${(project.technologies || []).join(', ')}</span>
          </div>
          <div class="frc-meta-item">
            <span class="label">Submitted Date</span>
            <span class="val">${project.submissionDate ? new Date(project.submissionDate).toLocaleDateString() : 'N/A'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Analytics View
async function renderAnalytics() {
  const stats = await apiFetchStats();
  if (!stats) return;

  const catBars = document.getElementById('analytics-category-bars');
  const statusBars = document.getElementById('analytics-status-bars');
  const batchBars = document.getElementById('analytics-batch-bars');
  const topTechCloud = document.getElementById('analytics-top-tech');

  const total = stats.totalProjects || 1;

  // 1. Categories
  if (catBars && Array.isArray(stats.categoryStats)) {
    const colors = ['fill-blue', 'fill-emerald', 'fill-purple', 'fill-amber'];
    catBars.innerHTML = stats.categoryStats.map((cs, idx) => {
      const pct = Math.round((cs.approved / total) * 100);
      return `
        <div class="chart-bar-item">
          <div class="chart-bar-label-row">
            <span>${cs.category} Development</span>
            <span>${cs.approved} (${pct}%)</span>
          </div>
          <div class="chart-bar-track">
            <div class="chart-bar-fill ${colors[idx % colors.length]}" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Status
  if (statusBars) {
    const appPct = Math.round((stats.approvedProjects / total) * 100);
    const penPct = Math.round((stats.pendingProjects / total) * 100);
    const rejPct = Math.round((stats.rejectedProjects / total) * 100);

    statusBars.innerHTML = `
      <div class="chart-bar-item">
        <div class="chart-bar-label-row">
          <span>Approved Projects</span>
          <span class="text-success">${stats.approvedProjects} (${appPct}%)</span>
        </div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill fill-emerald" style="width: ${appPct}%;"></div>
        </div>
      </div>
      <div class="chart-bar-item">
        <div class="chart-bar-label-row">
          <span>Pending Evaluation</span>
          <span class="text-warning">${stats.pendingProjects} (${penPct}%)</span>
        </div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill fill-amber" style="width: ${penPct}%;"></div>
        </div>
      </div>
      <div class="chart-bar-item">
        <div class="chart-bar-label-row">
          <span>Rejected Submissions</span>
          <span class="text-danger">${stats.rejectedProjects} (${rejPct}%)</span>
        </div>
        <div class="chart-bar-track">
          <div class="chart-bar-fill fill-red" style="width: ${rejPct}%;"></div>
        </div>
      </div>
    `;
  }

  // 3. Batches
  if (batchBars && Array.isArray(stats.batchStats)) {
    batchBars.innerHTML = stats.batchStats.map(bs => {
      const pct = Math.round((bs.count / total) * 100);
      return `
        <div class="chart-bar-item">
          <div class="chart-bar-label-row">
            <span>Batch ${bs.batch}</span>
            <span>${bs.count} (${pct}%)</span>
          </div>
          <div class="chart-bar-track">
            <div class="chart-bar-fill fill-purple" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Technologies
  if (topTechCloud && Array.isArray(stats.topTechnologies)) {
    if (stats.topTechnologies.length === 0) {
      topTechCloud.innerHTML = '<span class="field-hint">No technology records available.</span>';
    } else {
      topTechCloud.innerHTML = stats.topTechnologies.map(t => `
        <div class="tech-freq-badge">
          <span>${escapeHTML(t.tech)}</span>
          <span class="tech-freq-count">${t.count}</span>
        </div>
      `).join('');
    }
  }
}

// --------------------------------------------------------------------------
// 9. PROJECT SUBMISSION & EDIT (MULTER FORMDATA)
// --------------------------------------------------------------------------

async function handleProjectFormSubmit(e) {
  e.preventDefault();

  const titleInput = document.getElementById('form-title');
  const categoryInput = document.getElementById('form-category');
  const batchInput = document.getElementById('form-batch');
  const techInput = document.getElementById('form-technologies');
  const teamInput = document.getElementById('form-team');
  const githubInput = document.getElementById('form-github');
  const descInput = document.getElementById('form-description');
  const editIdInput = document.getElementById('form-project-id');
  const submitBtn = document.getElementById('btn-submit-project');

  clearFormErrors();

  let hasError = false;

  if (!titleInput.value.trim() || titleInput.value.trim().length < 3) {
    showFieldError('error-title', 'Title must be at least 3 characters');
    titleInput.classList.add('invalid');
    hasError = true;
  }
  if (!categoryInput.value) {
    showFieldError('error-category', 'Please select a category');
    categoryInput.classList.add('invalid');
    hasError = true;
  }
  if (!batchInput.value) {
    showFieldError('error-batch', 'Please select an academic batch');
    batchInput.classList.add('invalid');
    hasError = true;
  }
  if (!techInput.value.trim()) {
    showFieldError('error-technologies', 'Please list technologies');
    techInput.classList.add('invalid');
    hasError = true;
  }
  if (!teamInput.value.trim()) {
    showFieldError('error-team', 'Please enter team members');
    teamInput.classList.add('invalid');
    hasError = true;
  }

  const githubUrl = githubInput.value.trim();
  const githubRegex = /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+.*$/;
  if (!githubUrl || !githubRegex.test(githubUrl)) {
    showFieldError('error-github', 'Must be a valid GitHub repo link starting with https://github.com/user/repo');
    githubInput.classList.add('invalid');
    hasError = true;
  }

  if (!descInput.value.trim() || descInput.value.trim().length < 15) {
    showFieldError('error-description', 'Description must be at least 15 characters long');
    descInput.classList.add('invalid');
    hasError = true;
  }

  if (hasError) {
    showToast('Please fix the form errors before submitting', 'error');
    return;
  }

  // Construct FormData for multipart submission
  const formData = new FormData();
  formData.append('title', titleInput.value.trim());
  formData.append('category', categoryInput.value);
  formData.append('batch', batchInput.value);
  formData.append('technologies', techInput.value.trim());
  formData.append('teamMembers', teamInput.value.trim());
  formData.append('githubLink', githubUrl);
  formData.append('description', descInput.value.trim());

  if (AppState.currentUploadedFile) {
    formData.append('screenshot', AppState.currentUploadedFile);
  }

  const editId = editIdInput.value;
  const isEditing = !!editId;

  const url = isEditing
    ? `${API_BASE_URL}/api/projects/${editId}`
    : `${API_BASE_URL}/api/projects/add`;

  const method = isEditing ? 'PUT' : 'POST';

  try {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> Processing...';

    const headers = {};
    if (AppState.authToken) {
      headers['Authorization'] = `Bearer ${AppState.authToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Submission failed');
    }

    showToast(result.message || 'Project saved successfully!', 'success');
    showFormAlert(result.message, 'success');
    resetProjectForm();

    setTimeout(() => {
      navigateToSection('my-projects');
    }, 1000);

  } catch (err) {
    console.error('[Submit Error]:', err);
    showToast(err.message, 'error');
    showFormAlert(err.message, 'danger');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>${isEditing ? '💾' : '🚀'}</span> ${isEditing ? 'Save Changes' : 'Submit Project'}`;
  }
}

// --------------------------------------------------------------------------
// 10. EDIT & DELETE PROJECT (STUDENT WORKFLOW)
// --------------------------------------------------------------------------

window.editProject = async function(projectId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`);
    const result = await response.json();
    if (!result.success || !result.data) {
      throw new Error('Project details could not be retrieved');
    }

    const project = result.data;

    if (project.status !== 'Pending') {
      showToast('Only projects with "Pending" status can be edited.', 'error');
      return;
    }

    navigateToSection('add-project');

    document.getElementById('form-section-title').textContent = 'Edit Project Submission';
    document.getElementById('form-section-subtitle').textContent = 'Modify your project details before faculty approval.';
    document.getElementById('btn-submit-label').textContent = 'Save Changes';
    document.getElementById('btn-submit-icon').textContent = '💾';

    document.getElementById('form-project-id').value = project._id || project.projectId;
    document.getElementById('form-title').value = project.title || '';
    document.getElementById('form-category').value = project.category || '';
    document.getElementById('form-batch').value = project.batch || '';
    document.getElementById('form-technologies').value = (project.technologies || []).join(', ');
    document.getElementById('form-team').value = (project.teamMembers || []).join(', ');
    document.getElementById('form-github').value = project.githubLink || project.githubUrl || '';
    document.getElementById('form-description').value = project.description || '';

    if (project.screenshotPath || project.screenshot) {
      const imgPath = project.screenshotPath || project.screenshot;
      const fullUrl = imgPath.startsWith('http') || imgPath.startsWith('data:')
        ? imgPath
        : `${API_BASE_URL}${imgPath}`;
      const previewWrapper = document.getElementById('preview-wrapper');
      const previewImg = document.getElementById('screenshot-preview-img');
      previewImg.src = fullUrl;
      previewWrapper.classList.remove('hidden');
    } else {
      removeScreenshotPreview();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteProject = async function(projectId) {
  if (!confirm('Are you sure you want to delete this pending project? This action cannot be undone.')) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Could not delete project');
    }

    showToast(result.message || 'Project deleted successfully.', 'warning');
    await renderMyProjects();
    await updateStatistics();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --------------------------------------------------------------------------
// 11. FACULTY APPROVAL WORKFLOW
// --------------------------------------------------------------------------

window.approveProject = async function(projectId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/status/${projectId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: 'Approved' })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Could not approve project');
    }

    showToast(result.message || 'Project approved & published to public gallery!', 'success');
    closeProjectModal();
    await renderFacultyReview();
    await renderDashboard();
    await updateStatistics();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.rejectProject = async function(projectId) {
  const reason = prompt(
    'Optional: Provide feedback for rejecting this submission:',
    'Code repository documentation needs README setup and clear installation steps.'
  );
  if (reason === null) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/faculty/status/${projectId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: 'Rejected', feedback: reason })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Could not reject project');
    }

    showToast(result.message || 'Project marked as rejected.', 'error');
    closeProjectModal();
    await renderFacultyReview();
    await updateStatistics();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --------------------------------------------------------------------------
// 12. PROJECT DETAILS MODAL
// --------------------------------------------------------------------------

window.viewProjectDetails = async function(projectId) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`);
    const result = await response.json();
    if (!result.success || !result.data) {
      throw new Error('Project details not available.');
    }

    const project = result.data;
    const projId = project._id || project.projectId;

    document.getElementById('modal-project-title').textContent = project.title;
    document.getElementById('modal-category-badge').textContent = project.category;

    const statusBadge = document.getElementById('modal-status-badge');
    statusBadge.textContent = project.status;
    statusBadge.className = `badge status-badge ${project.status.toLowerCase()}`;

    document.getElementById('modal-student-name').textContent = project.studentName || 'Student';
    document.getElementById('modal-batch').textContent = project.batch || 'Batch';
    document.getElementById('modal-team-members').textContent = (project.teamMembers || []).join(', ');
    document.getElementById('modal-description').textContent = project.description;

    // Screenshot handling
    const screenshotImg = document.getElementById('modal-screenshot-img');
    const fallbackBox = document.getElementById('modal-fallback-thumbnail');
    const fallbackCat = document.getElementById('modal-fallback-category');

    const imgPath = project.screenshotPath || project.screenshot;
    if (imgPath && imgPath.trim() !== '') {
      const fullUrl = imgPath.startsWith('http') || imgPath.startsWith('data:')
        ? imgPath
        : `${API_BASE_URL}${imgPath}`;
      screenshotImg.src = fullUrl;
      screenshotImg.classList.remove('hidden');
      fallbackBox.classList.add('hidden');
    } else {
      screenshotImg.src = '';
      screenshotImg.classList.add('hidden');
      fallbackBox.classList.remove('hidden');
      fallbackCat.textContent = `${project.category} Project`;
    }

    // Tech tags
    const techContainer = document.getElementById('modal-tech-tags');
    techContainer.innerHTML = (project.technologies || []).map(t => `
      <span class="tech-tag">${escapeHTML(t)}</span>
    `).join('');

    // GitHub link
    const githubLink = document.getElementById('modal-github-link');
    const githubUrlText = document.getElementById('modal-github-url');
    const repoUrl = project.githubLink || project.githubUrl || '#';
    githubLink.href = repoUrl;
    githubUrlText.textContent = repoUrl;

    // Faculty Actions in modal
    const facultyActions = document.getElementById('modal-faculty-actions');
    if (AppState.currentUser?.role === 'faculty') {
      facultyActions.classList.remove('hidden');
      document.getElementById('modal-approve-btn').onclick = () => approveProject(projId);
      document.getElementById('modal-reject-btn').onclick = () => rejectProject(projId);
    } else {
      facultyActions.classList.add('hidden');
    }

    document.getElementById('project-modal-overlay').classList.remove('hidden');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function closeProjectModal() {
  const modal = document.getElementById('project-modal-overlay');
  if (modal) modal.classList.add('hidden');
}

// --------------------------------------------------------------------------
// 13. AUTH MODAL (LOGIN & REGISTRATION)
// --------------------------------------------------------------------------

function openAuthModal(defaultRole = 'student') {
  AppState.authModalRole = defaultRole;
  AppState.authModalMode = 'login';

  const modal = document.getElementById('auth-modal-overlay');
  const alertBox = document.getElementById('auth-alert');
  if (alertBox) alertBox.classList.add('hidden');

  switchAuthRoleTab(defaultRole);
  modal.classList.remove('hidden');
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal-overlay');
  if (modal) modal.classList.add('hidden');
}

function switchAuthRoleTab(role) {
  AppState.authModalRole = role;
  const tabStudent = document.getElementById('auth-tab-student');
  const tabFaculty = document.getElementById('auth-tab-faculty');
  const containerStudent = document.getElementById('student-auth-container');
  const containerFaculty = document.getElementById('faculty-auth-container');
  const roleBadge = document.getElementById('auth-role-badge');
  const title = document.getElementById('auth-modal-title');

  if (role === 'faculty') {
    tabFaculty.classList.add('active');
    tabStudent.classList.remove('active');
    containerFaculty.classList.remove('hidden');
    containerStudent.classList.add('hidden');
    roleBadge.textContent = 'Faculty Reviewer';
    title.textContent = 'Sign In: Faculty Evaluation Panel';
  } else {
    tabStudent.classList.add('active');
    tabFaculty.classList.remove('active');
    containerStudent.classList.remove('hidden');
    containerFaculty.classList.add('hidden');
    roleBadge.textContent = 'Student Developer';
    title.textContent = 'Sign In to ShowcaseHub';
  }
}

function toggleStudentAuthMode() {
  const isRegister = AppState.authModalMode === 'login';
  AppState.authModalMode = isRegister ? 'register' : 'login';

  const groupName = document.getElementById('group-auth-name');
  const groupBatch = document.getElementById('group-auth-batch');
  const btnLabel = document.getElementById('btn-auth-submit-label');
  const toggleBtn = document.getElementById('btn-toggle-auth-mode');
  const modeText = document.getElementById('auth-mode-text');

  if (isRegister) {
    groupName.classList.remove('hidden');
    groupBatch.classList.remove('hidden');
    btnLabel.textContent = 'Create Student Account';
    toggleBtn.textContent = 'Sign In Instead';
    modeText.textContent = 'Already have an account?';
  } else {
    groupName.classList.add('hidden');
    groupBatch.classList.add('hidden');
    btnLabel.textContent = 'Sign In as Student';
    toggleBtn.textContent = 'Create an Account';
    modeText.textContent = 'New student developer?';
  }
}

async function handleStudentAuthSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const nameInput = document.getElementById('auth-name');
  const batchInput = document.getElementById('auth-batch');
  const alertBox = document.getElementById('auth-alert');

  const isRegister = AppState.authModalMode === 'register';
  const url = isRegister
    ? `${API_BASE_URL}/api/auth/register`
    : `${API_BASE_URL}/api/auth/login`;

  const bodyData = {
    email: emailInput.value.trim(),
    password: passwordInput.value
  };

  if (isRegister) {
    bodyData.name = nameInput.value.trim();
    bodyData.batch = batchInput.value;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.message || 'Authentication failed');
    }

    setSession(result.user, result.token);
    showToast(`Welcome, ${result.user.name}!`, 'success');
    closeAuthModal();

    await renderDashboard();
    await renderMyProjects();
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.className = 'alert-box danger';
    alertBox.classList.remove('hidden');
  }
}

async function handleFacultyAuthSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('faculty-auth-email');
  const passwordInput = document.getElementById('faculty-auth-password');
  const alertBox = document.getElementById('auth-alert');

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.message || 'Login failed');
    }

    if (result.user.role !== 'faculty') {
      throw new Error('This account is not authorized as Faculty Evaluator.');
    }

    setSession(result.user, result.token);
    showToast(`Signed in as Faculty Evaluator: ${result.user.name}`, 'success');
    closeAuthModal();

    navigateToSection('faculty-review');
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.className = 'alert-box danger';
    alertBox.classList.remove('hidden');
  }
}

async function quickLogin(email, password) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || 'Quick login failed');

    setSession(result.user, result.token);
    showToast(`Logged in as ${result.user.name} (${result.user.role})`, 'success');
    closeAuthModal();

    if (result.user.role === 'faculty') {
      navigateToSection('faculty-review');
    } else {
      navigateToSection('dashboard');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --------------------------------------------------------------------------
// 14. IMAGE UPLOAD & PREVIEW
// --------------------------------------------------------------------------

function setupImageUploadHandlers() {
  const fileInput = document.getElementById('form-screenshot-input');
  const previewWrapper = document.getElementById('preview-wrapper');
  const previewImg = document.getElementById('screenshot-preview-img');
  const btnRemove = document.getElementById('btn-remove-preview');

  if (!fileInput) return;

  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file (PNG, JPG, WEBP)', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image size exceeds 5MB limit', 'error');
        return;
      }

      AppState.currentUploadedFile = file;

      const reader = new FileReader();
      reader.onload = function(evt) {
        previewImg.src = evt.target.result;
        previewWrapper.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  });

  if (btnRemove) {
    btnRemove.addEventListener('click', removeScreenshotPreview);
  }
}

function removeScreenshotPreview() {
  AppState.currentUploadedFile = null;
  const fileInput = document.getElementById('form-screenshot-input');
  const previewWrapper = document.getElementById('preview-wrapper');
  const previewImg = document.getElementById('screenshot-preview-img');

  if (fileInput) fileInput.value = '';
  if (previewImg) previewImg.src = '';
  if (previewWrapper) previewWrapper.classList.add('hidden');
}

// --------------------------------------------------------------------------
// 15. UI HELPERS & FORM RESETS
// --------------------------------------------------------------------------

function showFieldError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = message;
}

function clearFormErrors() {
  document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
  document.querySelectorAll('#project-form input, #project-form select, #project-form textarea')
    .forEach(i => i.classList.remove('invalid'));

  const alertBox = document.getElementById('form-alert');
  if (alertBox) alertBox.classList.add('hidden');
}

function showFormAlert(message, type) {
  const alertBox = document.getElementById('form-alert');
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert-box ${type}`;
  alertBox.classList.remove('hidden');
}

function resetProjectForm() {
  const form = document.getElementById('project-form');
  if (form) form.reset();

  document.getElementById('form-project-id').value = '';
  document.getElementById('form-section-title').textContent = 'Submit New Project';
  document.getElementById('form-section-subtitle').textContent = 'Provide comprehensive project details. All submissions will be reviewed by faculty before public showcase.';
  document.getElementById('btn-submit-label').textContent = 'Submit Project';
  document.getElementById('btn-submit-icon').textContent = '🚀';

  clearFormErrors();
  removeScreenshotPreview();
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  toast.innerHTML = `
    <span>${icons[type] || 'ℹ️'}</span>
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }, 3500);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --------------------------------------------------------------------------
// 16. BOOTSTRAP EVENT LISTENERS
// --------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async function() {
  // Initialize user session
  initAuth();

  // Sidebar navigation listeners
  document.querySelectorAll('.nav-link[data-target]').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      navigateToSection(this.getAttribute('data-target'));
    });
  });

  // Logout listener
  const logoutBtn = document.getElementById('nav-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      if (confirm('Log out from current session?')) {
        clearSession();
        navigateToSection('dashboard');
        showToast('Logged out successfully.', 'info');
      }
    });
  }

  // Header Role Switch Button -> Opens Auth Modal or switches
  const roleSwitchBtn = document.getElementById('role-switch-btn');
  if (roleSwitchBtn) {
    roleSwitchBtn.addEventListener('click', function() {
      const targetRole = AppState.currentUser?.role === 'faculty' ? 'student' : 'faculty';
      openAuthModal(targetRole);
    });
  }

  // User Profile click -> Opens Auth Modal
  const userProfile = document.getElementById('user-profile');
  if (userProfile) {
    userProfile.style.cursor = 'pointer';
    userProfile.addEventListener('click', () => openAuthModal(AppState.currentUser?.role || 'student'));
  }

  // Auth modal event handlers
  const authModalClose = document.getElementById('auth-modal-close-btn');
  const authFooterClose = document.getElementById('auth-modal-footer-close');
  const authOverlay = document.getElementById('auth-modal-overlay');

  if (authModalClose) authModalClose.addEventListener('click', closeAuthModal);
  if (authFooterClose) authFooterClose.addEventListener('click', closeAuthModal);
  if (authOverlay) {
    authOverlay.addEventListener('click', (e) => {
      if (e.target === authOverlay) closeAuthModal();
    });
  }

  const tabStudent = document.getElementById('auth-tab-student');
  const tabFaculty = document.getElementById('auth-tab-faculty');
  if (tabStudent) tabStudent.addEventListener('click', () => switchAuthRoleTab('student'));
  if (tabFaculty) tabFaculty.addEventListener('click', () => switchAuthRoleTab('faculty'));

  const btnToggleAuth = document.getElementById('btn-toggle-auth-mode');
  if (btnToggleAuth) btnToggleAuth.addEventListener('click', toggleStudentAuthMode);

  const studentAuthForm = document.getElementById('student-auth-form');
  if (studentAuthForm) studentAuthForm.addEventListener('submit', handleStudentAuthSubmit);

  const facultyAuthForm = document.getElementById('faculty-auth-form');
  if (facultyAuthForm) facultyAuthForm.addEventListener('submit', handleFacultyAuthSubmit);

  const btnQuickStudent = document.getElementById('btn-quick-student');
  if (btnQuickStudent) {
    btnQuickStudent.addEventListener('click', () => quickLogin('student@showcase.edu', 'student123'));
  }

  const btnQuickFaculty = document.getElementById('btn-quick-faculty');
  if (btnQuickFaculty) {
    btnQuickFaculty.addEventListener('click', () => quickLogin('faculty@showcase.edu', 'faculty123'));
  }

  // Sidebar mobile toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  // Notifications dropdown
  const notifBtn = document.getElementById('notif-btn');
  const notifDropdown = document.getElementById('notif-dropdown');
  const clearNotifsBtn = document.getElementById('clear-notifs-btn');
  const notifCount = document.getElementById('notif-count');

  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
        notifDropdown.classList.add('hidden');
      }
    });
  }

  if (clearNotifsBtn && notifCount) {
    clearNotifsBtn.addEventListener('click', () => {
      notifCount.textContent = '0';
      notifCount.style.display = 'none';
      showToast('Notifications marked as read', 'info');
    });
  }

  // Dashboard hero buttons
  const dashAddBtn = document.getElementById('dashboard-add-btn');
  const dashExploreBtn = document.getElementById('dashboard-explore-btn');
  const viewAllFeaturedBtn = document.getElementById('view-all-featured-btn');

  if (dashAddBtn) dashAddBtn.addEventListener('click', () => navigateToSection('add-project'));
  if (dashExploreBtn) dashExploreBtn.addEventListener('click', () => navigateToSection('explore'));
  if (viewAllFeaturedBtn) viewAllFeaturedBtn.addEventListener('click', () => navigateToSection('explore'));

  // Global search input
  const globalSearchInput = document.getElementById('global-search-input');
  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
      AppState.filters.title = e.target.value;
      const exploreTitle = document.getElementById('filter-title-input');
      if (exploreTitle) exploreTitle.value = e.target.value;
      navigateToSection('explore');
    });
  }

  // Explore section filters
  const filterTitle = document.getElementById('filter-title-input');
  const filterTech = document.getElementById('filter-tech-input');
  const filterCat = document.getElementById('filter-category-select');
  const filterBatch = document.getElementById('filter-batch-select');
  const resetFiltersBtn = document.getElementById('reset-filters-btn');
  const clearSearchBtn = document.getElementById('clear-search-btn');

  if (filterTitle) {
    filterTitle.addEventListener('input', (e) => {
      AppState.filters.title = e.target.value;
      renderExploreProjects();
    });
  }
  if (filterTech) {
    filterTech.addEventListener('input', (e) => {
      AppState.filters.tech = e.target.value;
      renderExploreProjects();
    });
  }
  if (filterCat) {
    filterCat.addEventListener('change', (e) => {
      AppState.filters.category = e.target.value;
      renderExploreProjects();
    });
  }
  if (filterBatch) {
    filterBatch.addEventListener('change', (e) => {
      AppState.filters.batch = e.target.value;
      renderExploreProjects();
    });
  }

  function resetAllFilters() {
    AppState.filters.title = '';
    AppState.filters.tech = '';
    AppState.filters.category = 'ALL';
    AppState.filters.batch = 'ALL';

    if (filterTitle) filterTitle.value = '';
    if (filterTech) filterTech.value = '';
    if (filterCat) filterCat.value = 'ALL';
    if (filterBatch) filterBatch.value = 'ALL';
    if (globalSearchInput) globalSearchInput.value = '';

    renderExploreProjects();
  }

  if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetAllFilters);
  if (clearSearchBtn) clearSearchBtn.addEventListener('click', resetAllFilters);

  // Category cards exploration buttons
  document.querySelectorAll('.cat-explore-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const cat = this.getAttribute('data-category');
      resetAllFilters();
      AppState.filters.category = cat;
      if (filterCat) filterCat.value = cat;
      navigateToSection('explore');
      renderExploreProjects();
    });
  });

  // Student Dashboard status tabs
  document.querySelectorAll('.status-tab[data-status]').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.status-tab[data-status]').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      AppState.studentTab = this.getAttribute('data-status');
      renderMyProjects();
    });
  });

  const myprojectsAddBtn = document.getElementById('myprojects-add-btn');
  const emptyAddProjectBtn = document.getElementById('empty-add-project-btn');
  if (myprojectsAddBtn) myprojectsAddBtn.addEventListener('click', () => navigateToSection('add-project'));
  if (emptyAddProjectBtn) emptyAddProjectBtn.addEventListener('click', () => navigateToSection('add-project'));

  // Faculty Review filter tabs
  document.querySelectorAll('.faculty-filter-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.faculty-filter-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      AppState.facultyTab = this.getAttribute('data-filter');
      renderFacultyReview();
    });
  });

  // Project form submission
  const projectForm = document.getElementById('project-form');
  if (projectForm) {
    projectForm.addEventListener('submit', handleProjectFormSubmit);
  }

  const cancelFormBtn = document.getElementById('btn-cancel-form');
  if (cancelFormBtn) {
    cancelFormBtn.addEventListener('click', () => {
      resetProjectForm();
      navigateToSection('my-projects');
    });
  }

  // Setup screenshot dropzone
  setupImageUploadHandlers();

  // Project modal close
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalFooterCloseBtn = document.getElementById('modal-footer-close-btn');
  const projectModalOverlay = document.getElementById('project-modal-overlay');

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeProjectModal);
  if (modalFooterCloseBtn) modalFooterCloseBtn.addEventListener('click', closeProjectModal);
  if (projectModalOverlay) {
    projectModalOverlay.addEventListener('click', (e) => {
      if (e.target === projectModalOverlay) closeProjectModal();
    });
  }

  // Initial render
  await renderDashboard();
});
