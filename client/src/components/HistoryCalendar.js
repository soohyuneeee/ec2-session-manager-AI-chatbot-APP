import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, Tooltip, IconButton, Collapse } from '@mui/material';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import './HistoryCalendar.css';

const HistoryCalendar = ({ socket, selectedInstance, onDateSelect }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [datesWithHistory, setDatesWithHistory] = useState([]); // ['2024-01-15', '2024-01-16', ...]
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (!socket || !selectedInstance) return;

    // 히스토리가 있는 날짜 목록 요청
    socket.emit('get-history-dates', { instanceId: selectedInstance.instanceId });

    // 히스토리 날짜 목록 수신
    socket.on('history-dates-loaded', (data) => {
      setDatesWithHistory(data.dates || []);
    });

    return () => {
      socket.off('history-dates-loaded');
    };
  }, [socket, selectedInstance]);

  const handleDateChange = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    
    setSelectedDate(date);
    
    // 선택한 날짜의 히스토리 조회
    if (socket && selectedInstance) {
      socket.emit('get-history-by-date', { 
        instanceId: selectedInstance.instanceId,
        date: dateString
      });
      
      // 부모 컴포넌트에 알림
      if (onDateSelect) {
        onDateSelect(dateString);
      }
    }
  };

  // 날짜에 히스토리가 있는지 확인
  const hasHistory = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    return datesWithHistory.includes(dateString);
  };

  // 타일에 클래스 추가 (히스토리가 있는 날짜)
  const tileClassName = ({ date, view }) => {
    if (view === 'month' && hasHistory(date)) {
      return 'has-history';
    }
    return null;
  };

  // 타일 내용 추가 (히스토리가 있는 날짜에 배지)
  const tileContent = ({ date, view }) => {
    if (view === 'month' && hasHistory(date)) {
      return <div className="history-badge">📝</div>;
    }
    return null;
  };

  const formatSelectedDate = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;
    const day = selectedDate.getDate();
    return `${year}년 ${month}월 ${day}일`;
  };

  return (
    <Paper
      elevation={2}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        overflow: 'hidden'
      }}
    >
      {/* 헤더 */}
      <Box
        sx={{
          p: 1.5,
          borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.02)'
          }
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CalendarMonthIcon sx={{ fontSize: 20, color: '#40e0d0' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            대화 기록 캘린더
          </Typography>
        </Box>
        <IconButton size="small">
          {isCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
        </IconButton>
      </Box>

      {/* 캘린더 */}
      <Collapse in={!isCollapsed}>
        <Box sx={{ p: 2 }}>
          <Calendar
            onChange={handleDateChange}
            value={selectedDate}
            tileClassName={tileClassName}
            tileContent={tileContent}
            locale="ko-KR"
            formatDay={(locale, date) => date.getDate().toString()}
          />

          {/* 안내 메시지 */}
          <Box sx={{ mt: 2, p: 1, backgroundColor: 'rgba(64, 224, 208, 0.1)', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#666' }}>
              📝 표시가 있는 날짜를 클릭하면 해당 날짜의 대화 기록을 볼 수 있습니다.
            </Typography>
          </Box>

          {/* 선택된 날짜 표시 */}
          {selectedDate && (
            <Box sx={{ mt: 1, p: 1, backgroundColor: 'rgba(138, 43, 226, 0.1)', borderRadius: 1 }}>
              <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                선택된 날짜: {formatSelectedDate()}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default HistoryCalendar;
