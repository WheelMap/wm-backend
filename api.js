const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const cors = require('cors');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session'); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '0000',
  database: 'wm'
});
app.use(session({
  secret: "0fd52107db31ebeea09da3c053348a13", // 세션을 암호화하는 데 사용되는 키
  resave: true,
  saveUninitialized: true,
}));

// Passport 초기화 및 사용 설정
app.use(passport.initialize());
app.use(passport.session());

// 로그인 시 사용자를 인증
passport.use(new LocalStrategy(
  (username, password, done) => {
    // 여기에서 사용자 인증을 수행하고, 인증이 성공하면 사용자 정보를 반환
    const user = getUserByUsername(username);
    if (!user) {
      return done(null, false, { message: '사용자를 찾을 수 없습니다.' });
    }
    if (user.password !== password) {
      return done(null, false, { message: '비밀번호가 일치하지 않습니다.' });
    }
    return done(null, user);
  }
));

// 사용자를 세션에 저장
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// 세션에서 사용자 정보 가져오기
passport.deserializeUser((id, done) => {
  const user = getUserById(id);
  done(null, user);
});

// MySQL 연결
db.connect((err) => {
  if (err) {
    console.error('MySQL 연결 오류:', err);
    throw err;
  }
  console.log('MySQL 데이터베이스에 연결되었습니다.');

  db.query(`
    CREATE TABLE IF NOT EXISTS userinfo (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nickname VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      profile_picture_url VARCHAR(255),
      kakao_id INT(255) UNIQUE
    )
  `, (err, result) => {
    if (err) {
      console.error('테이블 생성 중 오류 발생:', err);
    } else {
      console.log('user_info 테이블이 생성되었습니다.');
    }
  });
});

// POST 요청 처리
app.post('/search', (req, res) => {
  try {
    const searchTerm = req.body.searchTerm;

    db.query(
      `SELECT * FROM info WHERE CONCAT(facility_name, sido_name, sigungu_code, road_address, longitude, providing_agency_code) LIKE ?`,
      [`%${searchTerm}%`],
      (err, results) => {
        if (err) {
          console.error(err);
          res.status(500).json({ error: 'Internal Server Error' });
          return;
        }

        res.json(results);
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// 로그인 API (카카오 ID로 사용자 찾기)
app.post('/login', (req, res) => {
  const { kakao_id, profile_picture, nickname, email } = req.body;
  console.log(profile_picture);
  console.log(nickname);
  console.log(email);
  console.log(kakao_id);

  // 데이터베이스에서 해당 kakao_id로 사용자 찾기
  db.query('SELECT * FROM userinfo WHERE kakao_id = ?', [kakao_id], (err, results) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ message: '로그인 중 오류가 발생했습니다.' });
    } else if (results.length > 0) {
      // 이미 존재하는 사용자인 경우, 프로필 정보를 업데이트
      const user_id = results[0].id;
      db.query('UPDATE userinfo SET profile_picture_url = ?,name = ?, email = ? WHERE id = ?', [profile_picture, nickname, email, user_id], (err, updateResult) => {
        if (err) {
          console.error(err.message);
          res.status(500).json({ message: '로그인 중 오류가 발생했습니다.' });
        } else {
          res.status(200).json({ message: '로그인 성공', user_id });
        }
      });
    } else {
      // 새로운 사용자인 경우, 사용자 정보를 추가
      db.query('INSERT INTO userinfo (profile_picture_url,name, email, kakao_id) VALUES (?, ?, ?, ?)', [profile_picture, nickname, email, kakao_id], (err, insertResult) => {
        if (err) {
          console.error(err.message);
          res.status(500).json({ message: '로그인 중 오류가 발생했습니다.' });
        } else {
          res.status(200).json({ message: '로그인 성공', user_id: insertResult.insertId });
        }
      });
    }
  });
});

// 찜 추가 및 찜 목록 조회 API
app.post('/like', (req, res) => {
  const { user_id, store_id } = req.body;

  if (!user_id || !store_id) {
      res.status(400).json({ message: 'user_id와 store_id는 필수 입력 사항입니다.' });
      return;
  }

  db.query('SELECT id FROM userinfo WHERE id = ?', [user_id], (err, userResults) => {
      if (err) {
          console.error(err.message);
          res.status(500).json({ message: '사용자 정보 조회 중 오류가 발생했습니다.' });
          return;
      }

      db.query('SELECT id FROM info WHERE id = ?', [store_id], (err, storeResults) => {
          if (err) {
              console.error(err.message);
              res.status(500).json({ message: '상점 정보 조회 중 오류가 발생했습니다.' });
              return;
          }

          if (userResults.length === 0) {
              res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
              return;
          }

          if (storeResults.length === 0) {
              res.status(404).json({ message: '상점을 찾을 수 없습니다.' });
              return;
          }

          // 찜 추가
          db.query('INSERT INTO likes (user_id, store_id) VALUES (?, ?)', [user_id, store_id], (err, result) => {
              if (err) {
                  console.error(err.message);
                  res.status(500).json({ message: '찜 추가 중 오류가 발생했습니다.' });
              } else {
                  // 찜 추가 성공
                  res.status(201).json({ message: '찜 추가 성공' });
              }
          });
      });
  });
});

app.post('/unlike', (req, res) => {
  const { user_id, store_id } = req.body;

  if (!user_id || !store_id) {
    res.status(400).json({ message: 'user_id와 store_id는 필수 입력 사항입니다.' });
    return;
  }

  db.query('DELETE FROM likes WHERE user_id = ? AND store_id = ?', [user_id, store_id], (err, result) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ message: '찜 취소 중 오류가 발생했습니다.' });
    } else {
      // 찜 취소 성공
      res.status(200).json({ message: '찜 취소 성공' });
    }
  });
});

app.get(`/liked-places`, (req, res) => {
  const userId = req.query.id; // 클라이언트에서 전송한 사용자 ID를 가져옴

  // 사용자 ID를 사용하여 해당 사용자가 찜한 장소 목록을 조회
  db.query('select * from likes l inner join info i on l.store_id = i.id where user_id = ?', [userId], (err, results) => {
    if (err) {
      console.error(err.message);
      res.status(500).json({ message: '찜한 장소 목록을 가져오는 중 오류가 발생했습니다.' });
    } else {
      // 찜한 장소 목록을 클라이언트에 반환
      res.status(200).json(results);
    }
  });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 ${PORT} 포트에서 실행 중입니다.`);
});