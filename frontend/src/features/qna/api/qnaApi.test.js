import { mapQuestion } from "./qnaApi";

test("maps server PENDING status and category labels for the consumer", () => {
  expect(mapQuestion({ id: 1, category: "USAGE", status: "PENDING", answers: [] })).toMatchObject({
    id: 1,
    categoryLabel: "서비스 이용",
    status: "OPEN",
  });
});
