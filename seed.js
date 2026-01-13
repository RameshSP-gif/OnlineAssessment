const { v4: uuidv4 } = require('uuid');

const SAMPLE_QUESTIONS = [
  { text: 'What is a closure in JavaScript?', options: ['A function and its lexical scope','A database','A CSS selector','A build tool'], correct: 0, tags: 'javascript,frontend', difficulty: 3 },
  { text: 'Which HTTP status code means Not Found?', options: ['200','301','404','500'], correct: 2, tags: 'web,backend', difficulty: 1 },
  { text: 'What is gradient descent used for?', options: ['Sorting data','Optimizing models','Managing memory','Design UI'], correct: 1, tags: 'ml,dl,ai', difficulty: 3 },
  { text: 'Which SQL command adds a row?', options: ['SELECT','INSERT','UPDATE','DELETE'], correct: 1, tags: 'sql,db', difficulty: 1 },
  { text: 'Which algorithm has average O(n log n) time?', options: ['Bubble sort','Quick sort','Selection sort','Insertion sort'], correct: 1, tags: 'algorithms', difficulty: 2 },
  { text: 'What does REST stand for?', options: ['Representational State Transfer','Rapid State Transfer','Remote Server Transfer','None'], correct: 0, tags: 'web,backend', difficulty: 1 },
  { text: 'Name a primary activation function in deep nets', options: ['ReLU','XML','HTTP','TCP'], correct: 0, tags: 'ml,dl', difficulty: 2 },
  { text: 'What is the difference between var and let in JS?', options: ['Scope only','Hoisting only','No difference','var is faster'], correct: 0, tags: 'javascript,frontend', difficulty: 2 },
  { text: 'Which layer is used for classification tasks in CNNs?', options: ['Convolutional','Pooling','Fully connected','Batch norm'], correct: 2, tags: 'ml,dl,ai', difficulty: 4 },
  { text: 'How many values can a boolean store?', options: ['1','2','3','4'], correct: 1, tags: 'programming', difficulty: 1 },
  { text: 'What is polymorphism?', options: ['Same interface, multiple forms','A type of bug','Memory leak','Database index'], correct: 0, tags: 'oop', difficulty: 2 },
  { text: 'Which is NOT a cloud provider?', options: ['AWS','Azure','Google Cloud','Docker'], correct: 3, tags: 'cloud,docker', difficulty: 1 },
  { text: 'What is tokenization in NLP?', options: ['Splitting text','Encrypting data','Compiling code','Compressing images'], correct: 0, tags: 'nlp,ml', difficulty: 2 },
  { text: 'Define overfitting.', options: ['Model performs poorly on training','Model performs well on training but poorly on unseen data','Model is undertrained','Model has no bias'], correct: 1, tags: 'ml', difficulty: 3 },
  { text: 'What is backpropagation?', options: ['Forward pass','Gradient computation for weights','Data augmentation','Hyperparameter tuning'], correct: 1, tags: 'ml,dl', difficulty: 4 },
  { text: 'Which command builds a docker image?', options: ['docker run','docker build','docker compose','docker push'], correct: 1, tags: 'docker,devops', difficulty: 2 },
  { text: 'Which sorting is stable?', options: ['Quick sort','Merge sort','Heap sort','Selection sort'], correct: 1, tags: 'algorithms', difficulty: 3 },
  { text: 'What does SQL injection exploit?', options: ['Network','User input','CPU','Memory'], correct: 1, tags: 'security,web', difficulty: 3 },
  { text: 'Which loss is used for classification?', options: ['MSE','Cross-entropy','L2','Huber'], correct: 1, tags: 'ml,dl', difficulty: 3 },
  { text: 'Explain normalization.', options: ['Scaling features','Encrypting data','Sorting arrays','Reducing rows'], correct: 0, tags: 'ml,data', difficulty: 2 },
  // tougher questions
  { text: 'Prove convergence properties of Adam optimizer in non-convex optimization.', options: ['Short essay','A formula','A single number','None of the above'], correct: 0, tags: 'ml,dl,ai', difficulty: 6 },
  { text: 'Design a consistent hashing scheme for distributed caches.', options: ['Diagram and explanation','A single API','One-liner','No idea'], correct: 0, tags: 'systems,distributed', difficulty: 5 },
  { text: 'Explain the Transformer architecture attention mechanism.', options: ['Self-attention explanation','Pool explanation','RNN description','None'], correct: 0, tags: 'nlp,dl,ai', difficulty: 5 },
  { text: 'How to avoid deadlocks in multi-threaded systems?', options: ['Lock ordering, timeouts','Never use threads','Use only one lock','None'], correct: 0, tags: 'systems,concurrency', difficulty: 5 },
];

function run(db, cb) {
  db.serialize(() => {
    const stmt = db.prepare('INSERT OR REPLACE INTO questions (id,text,options,correct,tags,difficulty) VALUES (?,?,?,?,?,?)');
    SAMPLE_QUESTIONS.forEach(q => {
      stmt.run(uuidv4(), q.text, JSON.stringify(q.options), q.correct, q.tags, q.difficulty);
    });
    stmt.finalize(cb);
  });
}

if (require.main === module) {
  const sqlite3 = require('sqlite3').verbose();
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  // Allow overriding DB path via env (useful on Vercel /tmp)
  const dbFile = process.env.SQLITE_DB || path.join(process.cwd(), 'data.sqlite');
  const db = new sqlite3.Database(dbFile);
  run(db, (err) => {
    if (err) console.error(err);
    else console.log('Seeded questions to', dbFile);
    db.close();
  });
}

module.exports = { run };
