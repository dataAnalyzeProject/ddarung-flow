package com.ddarungflow.dto;

import com.ddarungflow.entity.QuestionCategory;
import com.ddarungflow.entity.QuestionVisibility;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionCreateRequest {

    @NotNull(message = "카테고리는 필수 입력사항입니다.")
    private QuestionCategory category;

    private QuestionVisibility visibility;

    @NotBlank(message = "제목은 필수 입력사항입니다.")
    @Size(max = 120, message = "제목은 120자 이하여야 합니다.")
    private String title;

    @NotBlank(message = "내용은 필수 입력사항입니다.")
    @Size(max = 5000, message = "내용은 5000자 이하여야 합니다.")
    private String body;
}
