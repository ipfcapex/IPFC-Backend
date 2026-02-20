pipeline {
    agent any
    options {
        skipStagesAfterUnstable()
        disableRestartFromStage()
    }
    tools {
        nodejs "nodejs"
    }
    stages {
        stage('Install Dependencies') {
            when {
                branch 'apex-shoes/api'
            }
            steps {
                sh 'npm install'
            }
        }

        stage('Create .env file') {
            when {
                branch 'apex-shoes/api'
            }
            environment {
                APEX_SHOES_API_QA_PORT = credentials("APEX_SHOES_API_QA_PORT")
                APEX_SHOES_API_QA_NODE_ENV = credentials("APEX_SHOES_API_QA_NODE_ENV")
                APEX_SHOES_API_QA_MONGO_URI = credentials("APEX_SHOES_API_QA_MONGO_URI")
                APEX_SHOES_API_QA_JWT_SECRET = credentials("APEX_SHOES_API_QA_JWT_SECRET")
                APEX_SHOES_API_QA_JWT_EXPIRES_IN = credentials("APEX_SHOES_API_QA_JWT_EXPIRES_IN")
			APEX_SHOES_API_QA_AWS_ACCESS_KEY = credentials("APEX_SHOES_API_QA_AWS_ACCESS_KEY")
				APEX_SHOES_API_QA_AWS_SECRET_KEY = credentials("APEX_SHOES_API_QA_AWS_SECRET_KEY")
				APEX_SHOES_API_QA_AWS_REGION = credentials("APEX_SHOES_API_QA_AWS_REGION")
				APEX_SHOES_API_QA_AWS_ACCESS_KEY_S3 = credentials("APEX_SHOES_API_QA_AWS_ACCESS_KEY_S3")
				APEX_SHOES_API_QA_AWS_SECRET_KEY_S3 = credentials("APEX_SHOES_API_QA_AWS_SECRET_KEY_S3")
				APEX_SHOES_API_QA_AWS_REGION_S3 = credentials("APEX_SHOES_API_QA_AWS_REGION_S3")
				APEX_SHOES_API_QA_AWS_BUCKET_S3 = credentials("APEX_SHOES_API_QA_AWS_BUCKET_S3")
				APEX_SHOES_API_QA_AWS_FOLDER_S3 = credentials("APEX_SHOES_API_QA_AWS_FOLDER_S3")
            }
            steps {
                sh '''#!/bin/bash
                echo 'Creating .env file...'
                rm -f .env
                echo PORT=$APEX_SHOES_API_QA_PORT > .env
                echo NODE_ENV=$APEX_SHOES_API_QA_NODE_ENV >> .env
                echo MONGO_URI=$APEX_SHOES_API_QA_MONGO_URI >> .env
                echo JWT_SECRET=$APEX_SHOES_API_QA_JWT_SECRET >> .env
                echo JWT_EXPIRES_IN=$APEX_SHOES_API_QA_JWT_EXPIRES_IN >> .env
			echo AWS_ACCESS_KEY=$APEX_SHOES_API_QA_AWS_ACCESS_KEY >> .env
			echo AWS_SECRET_KEY=$APEX_SHOES_API_QA_AWS_SECRET_KEY >> .env
			echo AWS_REGION=$APEX_SHOES_API_QA_AWS_REGION >> .env
			echo AWS_ACCESS_KEY_S3=$APEX_SHOES_API_QA_AWS_ACCESS_KEY_S3 >> .env
			echo AWS_SECRET_KEY_S3=$APEX_SHOES_API_QA_AWS_SECRET_KEY_S3 >> .env
			echo AWS_REGION_S3=$APEX_SHOES_API_QA_AWS_REGION_S3 >> .env
			echo AWS_BUCKET_S3=$APEX_SHOES_API_QA_AWS_BUCKET_S3 >> .env
			echo AWS_FOLDER_S3=$APEX_SHOES_API_QA_AWS_FOLDER_S3 >> .env
                '''
            }
        }

        stage('deploy-dev') {
            when {
                branch 'apex-shoes/api'
            }
            steps {
                sh '''#!/bin/bash
		cd /var/lib/jenkins/workspace/PEX-SHOES-BACKEND_apex-shoes_api
                pm2 restart ecosystem.config.json && pm2 save
                '''
            }
        }
    }
}
