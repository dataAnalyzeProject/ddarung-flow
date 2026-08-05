# Airflow 버전이 의도치 않게 바뀌지 않도록 기반 이미지와 설치 버전을 함께 고정한다.
ARG AIRFLOW_VERSION=3.3.0
FROM apache/airflow:${AIRFLOW_VERSION}

ARG AIRFLOW_VERSION=3.3.0
# 저장소의 Python 테스트 의존성만 추가하고 Airflow 버전은 그대로 유지한다.
COPY pipeline/requirements.txt /opt/airflow/pipeline-requirements.txt
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" \
    -r /opt/airflow/pipeline-requirements.txt
