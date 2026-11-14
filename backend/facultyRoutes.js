/**
 * ==========================================================================
 * Mini Project Showcase Portal - Faculty & Approval Workflow Routes
 * Technology: Node.js & Express.js with Official MongoDB Driver
 * Database Collection: projects
 * Implements Problem Statement 4:
 *   - Faculty Dashboard Evaluation
 *   - Pending Projects Retrieval from MongoDB
 *   - Project Approval (Publishes to public gallery in MongoDB)
 *   - Project Rejection (Stores feedback & hides from public gallery)
 * ==========================================================================
 */

const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { verifyToken, requireFaculty } = require('./authRoutes');

// Helper to convert string to ObjectId safely
function toObjectId(id) {
  if (!id) return null;
  if (ObjectId.isValid(id) && String(new ObjectId(id)) === String(id)) {
    return new ObjectId(id);
  }
  return null;
}

/**
 * GET /api/faculty/pending
 * View all submissions awaiting faculty review from MongoDB
 */
router.get('/pending', verifyToken, requireFaculty, async (req, res) => {
  try {
    const projectsColl = req.db.collection('projects');
    const { status } = req.query;
    const targetStatus = status || 'Pending';

    const query = targetStatus === 'ALL'
      ? {}
      : { status: targetStatus };

    const pendingProjects = await projectsColl.find(query)
      .sort({ createdAt: -1, submissionDate: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: pendingProjects.length,
      data: pendingProjects
    });
  } catch (error) {
    console.error('[MongoDB Faculty Pending Error]:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch pending submissions from MongoDB.' });
  }
});

/**
 * GET /api/faculty/all
 * View all projects across all statuses for faculty audit from MongoDB
 */
router.get('/all', verifyToken, requireFaculty, async (req, res) => {
  try {
    const projectsColl = req.db.collection('projects');
    const projects = await projectsColl.find({})
      .sort({ createdAt: -1, submissionDate: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: projects.length,
      data: projects
    });
  } catch (error) {
    console.error('[MongoDB Faculty All Error]:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch all submissions from MongoDB.' });
  }
});

/**
 * PUT /api/faculty/status/:id
 * Approve or Reject project with feedback in MongoDB
 * Rule: Only authenticated Faculty / Admin can approve or reject projects
 */
router.put('/status/:id', verifyToken, requireFaculty, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;

    if (!status || !['Approved', 'Rejected', 'Pending'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Status must be "Approved", "Rejected", or "Pending".'
      });
    }

    const projectsColl = req.db.collection('projects');
    const objectId = toObjectId(id);

    const query = objectId
      ? { $or: [{ _id: objectId }, { projectId: id }, { id: id }] }
      : { $or: [{ projectId: id }, { id: id }] };

    const project = await projectsColl.findOne(query);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found in MongoDB.' });
    }

    const updateDoc = {
      status: status,
      facultyFeedback: feedback !== undefined ? feedback : (project.facultyFeedback || ''),
      reviewedBy: req.user.name,
      reviewedAt: new Date()
    };

    await projectsColl.updateOne(query, { $set: updateDoc });
    const updatedProject = await projectsColl.findOne(query);

    const actionText = status === 'Approved' ? 'approved and published to the public showcase' : 'marked as rejected';

    return res.status(200).json({
      success: true,
      message: `Project "${project.title}" has been ${actionText} in MongoDB.`,
      data: updatedProject
    });

  } catch (error) {
    console.error('[MongoDB Status Update Error]:', error);
    return res.status(500).json({ success: false, message: 'Error updating project approval status in MongoDB.' });
  }
});

module.exports = router;
