const express = require('express');
const { ObjectId } = require('mongodb');
const { verifyToken, requireFaculty } = require('./authRoutes');

const router = express.Router();

function toObjectId(id) {
  if (!id || !ObjectId.isValid(id) || String(new ObjectId(id)) !== String(id)) {
    return null;
  }
  return new ObjectId(id);
}

router.get('/pending', verifyToken, requireFaculty, async (req, res) => {
  try {
    const status = req.query.status || 'Pending';
    const query = status === 'ALL' ? {} : { status };
    const projects = await req.db.collection('projects')
      .find(query)
      .sort({ createdAt: -1, submissionDate: -1 })
      .toArray();

    return res.status(200).json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    console.error('[MongoDB Faculty Pending Error]:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch pending submissions from MongoDB.' });
  }
});

router.get('/all', verifyToken, requireFaculty, async (req, res) => {
  try {
    const projects = await req.db.collection('projects')
      .find({})
      .sort({ createdAt: -1, submissionDate: -1 })
      .toArray();

    return res.status(200).json({ success: true, count: projects.length, data: projects });
  } catch (error) {
    console.error('[MongoDB Faculty All Error]:', error);
    return res.status(500).json({ success: false, message: 'Could not fetch all submissions from MongoDB.' });
  }
});

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

    const projects = req.db.collection('projects');
    const objectId = toObjectId(id);
    const query = objectId
      ? { $or: [{ _id: objectId }, { projectId: id }, { id }] }
      : { $or: [{ projectId: id }, { id }] };
    const project = await projects.findOne(query);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found in MongoDB.' });
    }

    await projects.updateOne(query, {
      $set: {
        status,
        facultyFeedback: feedback !== undefined ? feedback : (project.facultyFeedback || ''),
        reviewedBy: req.user.name,
        reviewedAt: new Date()
      }
    });

    const updatedProject = await projects.findOne(query);
    const action = status === 'Approved'
      ? 'approved and published to the public showcase'
      : 'marked as rejected';

    return res.status(200).json({
      success: true,
      message: `Project "${project.title}" has been ${action} in MongoDB.`,
      data: updatedProject
    });
  } catch (error) {
    console.error('[MongoDB Status Update Error]:', error);
    return res.status(500).json({ success: false, message: 'Error updating project approval status in MongoDB.' });
  }
});

module.exports = router;
