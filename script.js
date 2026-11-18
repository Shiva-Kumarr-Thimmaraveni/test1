const boardElement = document.getElementById("board");
const turnText = document.getElementById("turn-text");
const turnIndicator = document.getElementById("turn-indicator");
const gameStateElement = document.getElementById("game-state");
const moveHistoryElement = document.getElementById("move-history");
const capturedWhiteElement = document.getElementById("captured-white");
const capturedBlackElement = document.getElementById("captured-black");
const promotionDialog = document.getElementById("promotion-dialog");

const glyphs = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
};

let board;
let turn;
let selected;
let legalMoves;
let lastMove;
let moveHistory;
let captured;
let castlingRights;
let enPassant;
let promotionMove;
let gameOver;

function makeInitialBoard() {
  return [
    ["bR","bN","bB","bQ","bK","bB","bN","bR"],
    ["bP","bP","bP","bP","bP","bP","bP","bP"],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null],
    ["wP","wP","wP","wP","wP","wP","wP","wP"],
    ["wR","wN","wB","wQ","wK","wB","wN","wR"]
  ];
}

function resetGame() {
  board = makeInitialBoard();
  turn = "w";
  selected = null;
  legalMoves = [];
  lastMove = null;
  moveHistory = [];
  captured = { w: [], b: [] };
  castlingRights = { w: { k: true, q: true }, b: { k: true, q: true } };
  enPassant = null;
  promotionMove = null;
  gameOver = false;
  gameStateElement.textContent = "";
  promotionDialog.close();
  render();
}

function pieceAt(row, col) {
  return board[row]?.[col] || null;
}

function colorOf(piece) {
  return piece ? piece[0] : null;
}

function typeOf(piece) {
  return piece ? piece[1].toLowerKey?.() : null;
}

function normalizeType(piece) {
  return piece ? piece[1].toLowerCase() : null;
}

function inBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function render() {
  boardElement.innerHTML = "";
  const checkedKing = isKingInCheck(turn) ? findKing(turn) : null;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      square.dataset.row = row;
      square.dataset.col = col;
      square.setAttribute("role", "gridcell");

      if (selected && selected.row === row && selected.col === col) {
        square.classList.add("selected");
      }

      if (lastMove && (
        (lastMove.from.row === row && lastMove.from.col === col) ||
        (lastMove.to.row === row && lastMove.to.col === col)
      )) {
        square.classList.add("last-move");
      }

      if (checkedKing && checkedKing.row === row && checkedKing.col === col) {
        square.classList.add("in-check");
      }

      const piece = pieceAt(row, col);
      if (piece) {
        const pieceSpan = document.createElement("span");
        pieceSpan.className = `piece ${colorOf(piece) === "w" ? "white" : "black"}`;
        pieceSpan.textContent = glyphs[colorOf(piece)][normalizeType(piece)];
        square.appendChild(pieceSpan);
      }

      const move = legalMoves.find(m => m.row === row && m.col === col);
      if (move) {
        const marker = document.createElement("span");
        marker.className = piece || move.enPassant ? "capture-ring" : "move-dot";
        square.appendChild(marker);
      }

      if (col === 0) {
        const rank = document.createElement("span");
        rank.className = "coordinate";
        rank.textContent = 8 - row;
        square.appendChild(rank);
      }
      if (row === 7) {
        const file = document.createElement("span");
        file.className = "coordinate";
        file.style.left = "auto";
        file.style.right = "4px";
        file.textContent = String.fromCharCode(97 + col);
        square.appendChild(file);
      }

      square.addEventListener("click", () => handleSquareClick(row, col));
      boardElement.appendChild(square);
    }
  }

  renderStatus();
  renderHistory();
  renderCaptured();
}

function renderStatus() {
  const name = turn === "w" ? "White" : "Black";
  turnText.textContent = `${name} to move`;
  turnIndicator.className = `turn-indicator ${turn === "b" ? "black" : ""}`;

  if (gameOver) {
    turnIndicator.className = "turn-indicator";
  }
}

function handleSquareClick(row, col) {
  if (gameOver) return;

  const piece = pieceAt(row, col);
  if (selected) {
    const move = legalMoves.find(m => m.row === row && m.col === col);
    if (move) {
      attemptMove(selected.row, selected.col, row, col, move);
      return;
    }
  }

  if (piece && colorOf(piece) === turn) {
    selected = { row, col };
    legalMoves = getLegalMoves(row, col);
  } else {
    selected = null;
    legalMoves = [];
  }
  render();
}

function attemptMove(fromRow, fromCol, toRow, toCol, move) {
  const piece = pieceAt(fromRow, fromCol);

  if (normalizeType(piece) === "p" && (toRow === 0 || toRow === 7)) {
    promotionMove = { fromRow, fromCol, toRow, toCol, move };
    const options = promotionDialog.querySelectorAll("[data-piece]");
    options.forEach(button => {
      button.textContent = glyphs[turn][button.dataset.piece];
      button.onclick = () => {
        promotionDialog.close();
        executeMove(fromRow, fromCol, toRow, toCol, move, button.dataset.piece);
      };
    });
    promotionDialog.showModal();
    return;
  }

  executeMove(fromRow, fromCol, toRow, toCol, move);
}

function executeMove(fromRow, fromCol, toRow, toCol, move, promotionType) {
  const movingPiece = pieceAt(fromRow, fromCol);
  const movingColor = colorOf(movingPiece);
  const movingType = normalizeType(movingPiece);
  const capturedPiece = pieceAt(toRow, toCol);

  let notation = "";
  if (movingType === "k" && Math.abs(toCol - fromCol) === 2) {
    notation = toCol === 6 ? "O-O" : "O-O-O";
  } else {
    if (movingType !== "p") notation += movingType.toUpperCase();
    if (capturedPiece || move.enPassant) notation += capturedPiece || move.enPassant ? "x" : "";
    if (movingType === "p" && (capturedPiece || move.enPassant)) {
      notation += String.fromCharCode(97 + fromCol);
    }
    notation += String.fromCharCode(97 + toCol) + (8 - toRow);
  }

  if (capturedPiece) captured[movingColor].push(capturedPiece);
  if (move.enPassant) {
    const capturedPawn = pieceAt(fromRow, toCol);
    if (capturedPawn) captured[movingColor].push(capturedPawn);
  }

  board[toRow][toCol] = promotionType
    ? `${movingColor}${promotionType.toUpperCase()}`
    : movingPiece;
  board[fromRow][fromCol] = null;

  if (move.enPassant) board[fromRow][toCol] = null;

  if (movingType === "k") {
    if (toCol - fromCol === 2) {
      board[toRow][5] = board[toRow][7];
      board[toRow][7] = null;
    } else if (fromCol - toCol === 2) {
      board[toRow][3] = board[toRow][0];
      board[toRow][0] = null;
    }
  }

  if (movingType === "k") castlingRights[movingColor].k = castlingRights[movingColor].q = false;
  if (movingType === "r") {
    if (fromRow === 7 && fromCol === 0) castlingRights.w.q = false;
    if (fromRow === 7 && fromCol === 7) castlingRights.w.k = false;
    if (fromRow === 0 && fromCol === 0) castlingRights.b.q = false;
    if (fromRow === 0 && fromCol === 7) castlingRights.b.k = false;
  }

  enPassant = null;
  if (movingType === "p" && Math.abs(toRow - fromRow) === 2) {
    enPassant = { row: (toRow + fromRow) / 2, col: fromCol, pawnRow: toRow, pawnCol: toCol };
  }

  lastMove = { from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } };

  const nextTurn = movingColor === "w" ? "b" : "w";
  turn = nextTurn;
  selected = null;
  legalMoves = [];

  if (isKingInCheck(nextTurn)) {
    notation += "+";
  }

  if (promotionType) {
    notation = notation.replace(/[a-h][1-8]$/, "");
  }
  if (promotionType) {
    notation = `${String.fromCharCode(97 + toCol)}${8 - toRow}${promotionType.toUpper === "W" ? "" : `=${promotionType.toUpperCase()}`}`;
  }

  moveHistory.push({ color: movingColor, notation });
  promotionMove = null;

  finishTurn(nextTurn);
}

function finishTurn(nextTurn) {
  const hasMoves = hasAnyLegalMove(nextTurn);
  if (!hasMoves) {
    gameOver = true;
    if (isKingInCheck(nextTurn)) {
      const winner = nextTurn === "w" ? "Black" : "White";
      gameStateElement.textContent = `Checkmate — ${winner} wins`;
      const last = moveHistory[moveHistory.length - 1];
      if (last) last.notation = last.notation.replace("+", "#");
    } else {
      gameStateElement.textContent = "Stalemate";
    }
  } else if (isKingInCheck(nextTurn)) {
    gameStateElement.textContent = "Check";
  } else {
    gameStateElement.textContent = "";
  }
  render();
}

function getPseudoMoves(row, col) {
  const piece = pieceAt(row, col);
  if (!piece) return [];
  const color = colorOf(piece);
  const type = normalizeType(piece);
  const moves = [];

  const addStep = (r, c, extra = {}) => {
    if (!inBounds(r, c)) return false;
    const target = pieceAt(r, c);
    if (!target) {
      moves.push({ row: r, col: c, ...extra });
      return true;
    }
    if (colorOf(target) !== color) {
      moves.push({ row: r, col: c, ...extra });
    }
    return false;
  };

  if (type === "p") {
    const direction = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    if (inBounds(row + direction, col) && !pieceAt(row + direction, col)) {
      moves.push({ row: row + direction, col });
      if (row === startRow && !pieceAt(row + 2 * direction, col)) {
        moves.push({ row: row + 2 * direction, col });
      }
    }
    for (const dc of [-1, 1]) {
      const r = row + direction;
      const c = col + dc;
      if (!inBounds(r, c)) continue;
      const target = pieceAt(r, c);
      if (target && colorOf(target) !== color) moves.push({ row: r, col: c });
      if (enPassant && enPassant.row === r && enPassant.col === c) {
        moves.push({ row: r, col: c, enPassant: true });
      }
    }
  }

  if (type === "n") {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      addStep(row + dr, col + dc);
    }
  }

  if (type === "b" || type === "r" || type === "q") {
    const directions = type === "b"
      ? [[-1,-1],[-1,1],[1,-1],[1,1]]
      : type === "r"
        ? [[-1,0],[1,0],[0,-1],[0,1]]
        : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of directions) {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        if (!addStep(r, c)) break;
        r += dr;
        c += dc;
      }
    }
  }

  if (type === "k") {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      addStep(row + dr, col + dc);
    }

    if (!isKingInCheck(color)) {
      const homeRow = color === "w" ? 7 : 0;
      if (row === homeRow && col === 4) {
        if (castlingRights[color].k &&
            !pieceAt(homeRow, 5) && !pieceAt(homeRow, 6) &&
            pieceAt(homeRow, 7) === `${color}R` &&
            !isSquareAttacked(homeRow, 5, color) &&
            !isSquareAttacked(homeRow, 6, color)) {
          moves.push({ row: homeRow, col: 6, castle: true });
        }
        if (castlingRights[color].q &&
            !pieceAt(homeRow, 1) && !pieceAt(homeRow, 2) && !pieceAt(homeRow, 3) &&
            pieceAt(homeRow, 0) === `${color}R` &&
            !isSquareAttacked(homeRow, 3, color) &&
            !isSquareAttacked(homeRow, 2, color)) {
          moves.push({ row: homeRow, col: 2, castle: true });
        }
      }
    }
  }

  return moves;
}

function getLegalMoves(row, col) {
  return getPseudoMoves(row, col).filter(move => {
    const savedFrom = board[row][col];
    const savedTo = board[move.row][move.col];
    const savedEnPassantPawn = move.enPassant ? board[row][move.col] : null;

    board[move.row][move.col] = savedFrom;
    board[row][col] = null;
    if (move.enPassant) board[row][move.col] = null;

    let legal = true;
    if (move.castle) {
      const rookFromCol = move.col === 6 ? 7 : 0;
      const rookToCol = move.col === 6 ? 5 : 3;
      board[move.row][rookToCol] = board[move.row][rookFromCol];
      board[move.row][rookFromCol] = null;
      legal = !isKingInCheck(colorOf(savedFrom));
    } else {
      legal = !isKingInCheck(colorOf(savedFrom));
    }

    board[row][col] = savedFrom;
    board[move.row][move.col] = savedTo;
    if (move.enPassant) board[row][move.col] = savedEnPassantPawn;
    if (move.castle) {
      const rookFromCol = move.col === 6 ? 7 : 0;
      const rookToCol = move.col === 6 ? 5 : 3;
      board[move.row][rookFromCol] = board[move.row][rookToCol];
      board[move.row][rookToCol] = null;
    }
    return legal;
  });
}

function findKing(color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === `${color}K`) return { row, col };
    }
  }
  return null;
}

function isKingInCheck(color) {
  const king = findKing(color);
  return king ? isSquareAttacked(king.row, king.col, color) : true;
}

function isSquareAttacked(row, col, defenderColor) {
  const attackerColor = defenderColor === "w" ? "b" : "w";

  const pawnDirection = attackerColor === "w" ? -1 : 1;
  for (const dc of [-1, 1]) {
    const pawnRow = row - pawnDirection;
    const pawnCol = col - dc;
    if (inBounds(pawnRow, pawnCol) && board[pawnRow][pawnCol] === `${attackerColor}P`) return true;
  }

  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const r = row + dr;
    const c = col + dc;
    if (inBounds(r, c) && board[r][c] === `${attackerColor}N`) return true;
  }

  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const piece = board[r][c];
      if (piece) {
        if (colorOf(piece) === attackerColor && ["b", "q"].includes(normalizeType(piece))) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const piece = board[r][c];
      if (piece) {
        if (colorOf(piece) === attackerColor && ["r", "q"].includes(normalizeType(piece))) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const r = row + dr;
    const c = col + dc;
    if (inBounds(r, c) && board[r][c] === `${attackerColor}K`) return true;
  }

  return false;
}

function hasAnyLegalMove(color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (colorOf(board[row][col]) === color && getLegalMoves(row, col).length > 0) return true;
    }
  }
  return false;
}

function renderHistory() {
  if (!moveHistory.length) {
    moveHistoryElement.innerHTML = '<p class="empty-history">No moves yet</p>';
    return;
  }

  let html = '<div class="history-grid">';
  for (let i = 0; i < moveHistory.length; i += 2) {
    html += `<span class="move-number">${i / 2 + 1}.</span>`;
    html += `<span class="move-name">${moveHistory[i]?.notation || ""}</span>`;
    html += `<span class="move-name">${moveHistory[i + 1]?.notation || ""}</span>`;
  }
  html += "</div>";
  moveHistoryElement.innerHTML = html;
  moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
}

function renderCaptured() {
  capturedWhiteElement.innerHTML = captured.w.map(piece => glyphs[colorOf(piece)][normalizeType(piece)]).join("");
  capturedBlackElement.innerHTML = captured.b.map(piece => glyphs[colorOf(piece)][normalizeType(piece)]).join("");
}

document.getElementById("new-game").addEventListener("click", resetGame);
resetGame();
