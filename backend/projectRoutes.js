/**
 * ==========================================================================
 * Mini Project Showcase Portal - Project & Category Management Routes
 * Technology: Node.js & Express.js with Official MongoDB Driver
 * Database Collection: projects, categories
 * Implements Problem Statement 4:
 *   - Project Submission with Multer Screenshot Upload
 *   - Search & Multi-criteria Filtering in MongoDB
 *   - Student Project Ownership (Edit / Delete Pending only)
 *   - Category Management
 *   - Dynamic Statistics Aggregation directly from MongoDB
 * ==========================================================================
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ObjectId } = require('mongodb');
const { verifyToken } = require('./authRoutes');

// Helper to convert string to ObjectId safely
function toObjectId(id) {
  if (!id) return null;
  if (ObjectId.isValid(id) && String(new ObjectId(id)) === String(id)) {
    return new ObjectId(id);
  }
  return null;
}

// --------------------------------------------------------------------------
// MULTER FILE UPLOAD CONFIGURATION (SCREENSHOTS)
// --------------------------------------------------------------------------

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '-');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `screenshot-${cleanName}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid image type. Only JPG, JPEG, PNG, and WEBP formats are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

const GITHUB_REGEX = /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+.*$/;

// --------------------------------------------------------------------------
// REST API ENDPOINTS (CONNECTED DIRECTLY TO MONGODB)
// --------------------------------------------------------------------------

/**
 * GET /api/projects/stats
 * Dynamic dashboard statistics aggregated directly from MongoDB
 */
router.get('/stats', async (req, res) => {
  try {
    const projectsColl = req.db.collection('projects');

    const [totalProjects, approvedProjects, pendingProjects, rejectedProjects] = await Promise.all([
      projectsColl.countDocuments(),
      projectsColl.countDocuments({ status: 'Approved' }),
      projectsColl.countDocuments({ status: 'Pending' }),
      projectsColl.countDocuments({ status: 'Rejected' })
    ]);

    // Distinct student contributors
    const distinctStudents = await projectsColl.distinct('studentName');

    // Category-wise statistics
    const categories = ['Web', 'Mobile', 'AI', 'IoT'];
    const categoryStats = await Promise.all(
      categories.map(async (cat) => {
        const approved = await projectsColl.countDocuments({
          category: { $regex: new RegExp(`^${cat}`, 'i') },
          status: 'Approved'
        });
        const total = await projectsColl.countDocuments({
          category: { $regex: new RegExp(`^${cat}`, 'i') }
        });
        return { category: cat, approved, total };
      })
    );

    // Batch-wise statistics
    const batches = ['2021-2025', '2022-2026', '2023-2027', '2024-2028'];
    const batchStats = await Promise.all(
      batches.map(async (batch) => {
        const count = await projectsColl.countDocuments({ batch });
        return { batch, count };
      })
    );

    // Technology stack usage frequency
    const allProjects = await projectsColl.find({}, { projection: { technologies: 1 } }).toArray();
    const techMap = {};
    allProjects.forEach(p => {
      if (Array.isArray(p.technologies)) {
        p.technologies.forEach(t => {
          const clean = t.trim();
          if (clean) techMap[clean] = (techMap[clean] || 0) + 1;
        });
      }
    });

    const topTechnologies = Object.entries(techMap)
      .map(([tech, count]) => ({ tech, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return res.status(200).json({
      success: true,
      data: {
        totalProjects,
        approvedProjects,
        pendingProjects,
        rejectedProjects,
        totalStudents: distinctStudents.length || 1,
        approvalRate: totalProjects > 0 ? Math.round((approvedProjects / totalProjects) * 100) : 0,
        categoryStats,
        batchStats,
        topTechnologies
      }
    });

  } catch (error) {
    console.error('[MongoDB Stats Error]:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch dashboard analytics from MongoDB.' });
  }
});

/**
 * GET /api/projects
 * Browse & Search approved projects in MongoDB (Public gallery displays only Approved projects)
 */
router.get('/', async (req, res) => {
  try {
    const projectsColl = req.db.collection('projects');
    const { search, tech, category, batch, status } = req.query;

    const query = {};

    // By default, public gallery only displays Approved projects
    if (status) {
      query.status = status;
    } else {
      query.status = 'Approved';
    }

    // Search by title or description
    if (search && search.trim() !== '') {
      const q = search.trim();
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ];
    }

    // Search by technology
    if (tech && tech.trim() !== '') {
      const tq = tech.trim();
      query.technologies = { $elemMatch: { $regex: tq, $options: 'i' } };
    }

    // Filter by category
    if (category && category !== 'ALL') {
      query.category = { $regex: new RegExp(`^${category}`, 'i') };
    }

    // Filter by batch
    if (batch && batch !== 'ALL') {
      query.batch = batch;
    }

    const projects = await projectsColl.find(query)
      .sort({ createdAt: -1, submissionDate: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: projects.length,
      data: projects
    });

  } catch (error) {
    console.error('[MongoDB Get Projects Error]:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving projects from MongoDB.' });
  }
});

/**
 * GET /api/projects/my
 * View logged-in student's own project submissions from MongoDB
 */
router.get('/my', verifyToken, async (req, res) => {
  try {
    const projectsColl = req.db.collection('projects');
    const userId = req.user.id;
    const userName = req.user.name;

    const query = {
      $or: [
        { studentId: userId },
        { studentName: { $regex: new RegExp(`^${userName}$`, 'i') } }
      ]
    };

    const myProjects = await projectsColl.find(query)
      .sort({ createdAt: -1, submissionDate: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: myProjects.length,
      data: myProjects
    });
  } catch (error) {
    console.error('[MongoDB Get My Projects Error]:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch your submitted projects.' });
  }
});

/**
 * GET /api/projects/category/:category
 * Browse approved projects filtered by category
 */
router.get('/category/:category', async (req, res) => {
  try {
    const projectsColl = req.db.collection('projects');
    const { category } = req.params;

    const catProjects = await projectsColl.find({
      category: { $regex: new RegExp(`^${category}`, 'i') },
      status: 'Approved'
    }).sort({ createdAt: -1, submissionDate: -1 }).toArray();

    return res.status(200).json({
      success: true,
      category,
      count: catProjects.length,
      data: catProjects
    });
  } catch (error) {
    console.error('[MongoDB Category Projects Error]:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving category projects.' });
  }
});

/**
 * GET /api/projects/:id
 * View individual project details from MongoDB
 */
router.get('/:id', async (req, res) => {
  try {
    const projectsColl = req.db.collection('projects');
    const { id } = req.params;
    const objectId = toObjectId(id);

    const query = objectId
      ? { $or: [{ _id: objectId }, { projectId: id }, { id: id }] }
      : { $or: [{ projectId: id }, { id: id }] };

    const project = await projectsColl.findOne(query);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found in MongoDB.' });
    }

    return res.status(200).json({ success: true, data: project });
  } catch (error) {
    console.error('[MongoDB Get Single Project Error]:', error);
    return res.status(500).json({ success: false, message: 'Error loading project details.' });
  }
});

/**
 * POST /api/projects/add
 * Submit new project with optional screenshot upload (Multer)
 * Automatically saved in MongoDB with "Pending" status
 */
router.post('/add', (req, res, next) => {
  verifyToken(req, res, () => next());
}, upload.single('screenshot'), async (req, res) => {
  try {
    const { title, description, technologies, teamMembers, githubLink, category, batch } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Project title is required.' });
    }
    if (!description || description.trim().length < 15) {
      return res.status(400).json({ success: false, message: 'Description must be at least 15 characters.' });
    }
    if (!category) {
      return res.status(400).json({ success: false, message: 'Category is required.' });
    }
    if (!batch) {
      return res.status(400).json({ success: false, message: 'Academic batch is required.' });
    }
    if (!githubLink || !GITHUB_REGEX.test(githubLink.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Must provide a valid GitHub repo link starting with https://github.com/username/repository'
      });
    }

    let techArray = [];
    if (typeof technologies === 'string') {
      techArray = technologies.split(',').map(t => t.trim()).filter(Boolean);
    } else if (Array.isArray(technologies)) {
      techArray = technologies;
    }

    let teamArray = [];
    if (typeof teamMembers === 'string') {
      teamArray = teamMembers.split(',').map(m => m.trim()).filter(Boolean);
    } else if (Array.isArray(teamMembers)) {
      teamArray = teamMembers;
    }

    let screenshotPath = '';
    if (req.file) {
      screenshotPath = `/uploads/${req.file.filename}`;
    } else if (req.body.screenshotPath) {
      screenshotPath = req.body.screenshotPath;
    }

    const studentId = req.user ? req.user.id : (req.body.studentId || 'std-' + Date.now());
    const studentName = req.user ? req.user.name : (req.body.studentName || 'Student Developer');

    const newProject = {
      projectId: 'proj-' + Date.now(),
      title: title.trim(),
      description: description.trim(),
      technologies: techArray,
      teamMembers: teamArray,
      githubLink: githubLink.trim(),
      screenshotPath,
      category,
      batch,
      studentId,
      studentName,
      status: 'Pending', // Strictly pending upon submission
      submissionDate: new Date(),
      createdAt: new Date(),
      facultyFeedback: ''
    };

    const projectsColl = req.db.collection('projects');
    const result = await projectsColl.insertOne(newProject);
    newProject._id = result.insertedId;

    return res.status(201).json({
      success: true,
      message: 'Project submitted successfully! Status: Pending faculty review.',
      data: newProject
    });

  } catch (error) {
    console.error('[MongoDB Add Project Error]:', error);
    return res.status(500).json({ success: false, message: error.message || 'Server error.' });
  }
});

/**
 * PUT /api/projects/:id
 * Edit project before approval
 * Rule: Students can edit ONLY their own projects and ONLY BEFORE approval (status === 'Pending')
 */
router.put('/:id', verifyToken, upload.single('screenshot'), async (req, res) => {
  try {
    const { id } = req.params;
    const projectsColl = req.db.collection('projects');
    const objectId = toObjectId(id);

    const query = objectId
      ? { $or: [{ _id: objectId }, { projectId: id }, { id: id }] }
      : { $or: [{ projectId: id }, { id: id }] };

    const project = await projectsColl.findOne(query);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found in MongoDB.' });
    }

    // Ownership & Status verification
    if (req.user.role !== 'faculty') {
      const isOwner = project.studentId === req.user.id || project.studentName === req.user.name;
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Forbidden. You can only edit your own project submissions.' });
      }
      if (project.status !== 'Pending') {
        return res.status(403).json({
          success: false,
          message: `Cannot edit this project. Current status is "${project.status}". Only Pending projects can be modified.`
        });
      }
    }

    const updates = {};
    if (req.body.title) updates.title = req.body.title.trim();
    if (req.body.description) updates.description = req.body.description.trim();
    if (req.body.category) updates.category = req.body.category;
    if (req.body.batch) updates.batch = req.body.batch;

    if (req.body.githubLink) {
      if (!GITHUB_REGEX.test(req.body.githubLink.trim())) {
        return res.status(400).json({ success: false, message: 'Invalid GitHub repository link.' });
      }
      updates.githubLink = req.body.githubLink.trim();
    }

    if (req.body.technologies) {
      updates.technologies = typeof req.body.technologies === 'string'
        ? req.body.technologies.split(',').map(t => t.trim()).filter(Boolean)
        : req.body.technologies;
    }

    if (req.body.teamMembers) {
      updates.teamMembers = typeof req.body.teamMembers === 'string'
        ? req.body.teamMembers.split(',').map(m => m.trim()).filter(Boolean)
        : req.body.teamMembers;
    }

    if (req.file) {
      updates.screenshotPath = `/uploads/${req.file.filename}`;
    }

    updates.updatedAt = new Date();

    await projectsColl.updateOne(query, { $set: updates });
    const updated = await projectsColl.findOne(query);

    return res.status(200).json({
      success: true,
      message: 'Project updated successfully in MongoDB.',
      data: updated
    });

  } catch (error) {
    console.error('[MongoDB Edit Project Error]:', error);
    return res.status(500).json({ success: false, message: 'Server error while updating project in MongoDB.' });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete project before approval
 * Rule: Students can delete ONLY their own projects and ONLY BEFORE approval (status === 'Pending')
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const projectsColl = req.db.collection('projects');
    const objectId = toObjectId(id);

    const query = objectId
      ? { $or: [{ _id: objectId }, { projectId: id }, { id: id }] }
      : { $or: [{ projectId: id }, { id: id }] };

    const project = await projectsColl.findOne(query);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found in MongoDB.' });
    }

    if (req.user.role !== 'faculty') {
      const isOwner = project.studentId === req.user.id || project.studentName === req.user.name;
      if (!isOwner) {
        return res.status(403).json({ success: false, message: 'Forbidden. You can only delete your own projects.' });
      }
      if (project.status !== 'Pending') {
        return res.status(403).json({
          success: false,
          message: `Cannot delete project. Current status is "${project.status}". Only Pending projects can be deleted.`
        });
      }
    }

    // Clean up local screenshot if stored
    if (project.screenshotPath && project.screenshotPath.startsWith('/uploads/')) {
      const localFilePath = path.join(__dirname, project.screenshotPath);
      if (fs.existsSync(localFilePath)) {
        try { fs.unlinkSync(localFilePath); } catch (e) {}
      }
    }

    await projectsColl.deleteOne(query);

    return res.status(200).json({
      success: true,
      message: 'Project deleted successfully from MongoDB.'
    });

  } catch (error) {
    console.error('[MongoDB Delete Project Error]:', error);
    return res.status(500).json({ success: false, message: 'Server error while deleting project from MongoDB.' });
  }
});

// --------------------------------------------------------------------------
// CATEGORY REST API ENDPOINTS
// --------------------------------------------------------------------------

router.get('/categories/all', async (req, res) => {
  try {
    const categories = await req.db.collection('categories').find({}).toArray();
    return res.status(200).json({ success: true, data: categories });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error retrieving categories from MongoDB.' });
  }
});

module.exports = router;
